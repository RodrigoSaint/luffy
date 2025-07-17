import { spawn } from 'node:child_process';
import { promises as fs, createWriteStream } from 'node:fs';
import path from 'node:path';
import axios from 'axios';
import { DownloadOptions, DownloadConfig } from './types.ts';

export class Downloader {
  private config: DownloadConfig;

  constructor(config: DownloadConfig) {
    this.config = config;
  }

  async download(options: DownloadOptions): Promise<void> {
    const { url, filename, downloadDir, subtitle, referer, m3u8Referer } = options;

    // Check if this is a placeholder URL
    if (url.includes('example.com/')) {
      if (url.includes('encoded-source-')) {
        const sourceName = url.match(/encoded-source-([^.]+)/)?.[1] || 'unknown';
        console.log(`\x1b[1;33m⚠ Encoded source detected: ${sourceName}\x1b[0m`);
        console.log(`\x1b[1;33m  The original ani-cli script has complex URL decoding logic\x1b[0m`);
        console.log(`\x1b[1;33m  that would need to be ported for actual ${sourceName} downloads.\x1b[0m`);
      } else {
        console.log(`\x1b[1;33m⚠ Placeholder URL detected for ${filename}\x1b[0m`);
        console.log(`\x1b[1;33m  This is a simplified implementation. The original ani-cli script has complex\x1b[0m`);
        console.log(`\x1b[1;33m  URL decoding logic that would need to be fully ported for actual downloads.\x1b[0m`);
      }
      return;
    }

    console.log(`\x1b[1;32m✓ Found direct source URL for ${filename}\x1b[0m`);
    console.log(`\x1b[1;36m  URL: ${url}\x1b[0m`);

    // Validate URL before downloading
    const isValidVideo = await this.validateVideoUrl(url, referer);
    if (!isValidVideo) {
      console.log(`\x1b[1;31m✗ URL does not return valid video content (returns HTML/text)\x1b[0m`);
      console.log(`\x1b[1;33m  This URL likely requires additional processing from the original ani-cli script\x1b[0m`);
      return;
    }

    // Ensure download directory exists
    await fs.mkdir(downloadDir, { recursive: true });

    // Download subtitle if provided
    if (subtitle) {
      await this.downloadSubtitle(subtitle, path.join(downloadDir, `${filename}.vtt`));
    }

    // Determine download method based on URL type
    if (url.includes('m3u8')) {
      await this.downloadM3U8(url, filename, downloadDir, referer || m3u8Referer);
    } else {
      await this.downloadDirect(url, filename, downloadDir, referer);
    }
  }

  private async downloadSubtitle(subtitleUrl: string, outputPath: string): Promise<void> {
    try {
      const response = await axios.get(subtitleUrl, { responseType: 'stream' });
      const writer = createWriteStream(outputPath);
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
    } catch (error) {
      console.error(`Failed to download subtitle: ${error}`);
    }
  }

  private async downloadM3U8(url: string, filename: string, downloadDir: string, referer?: string): Promise<void> {
    const outputPath = path.join(downloadDir, `${filename}.mp4`);

    // For m3u8 streams, prefer ffmpeg or yt-dlp with ffmpeg downloader to avoid issues
    if (await this.commandExists('ffmpeg')) {
      await this.runFFmpeg(url, outputPath, referer);
    } else if (this.config.useYtDlp && await this.commandExists('yt-dlp')) {
      await this.runYtDlpWithFFmpeg(url, outputPath, referer);
    } else {
      throw new Error('ffmpeg is required for m3u8 download to avoid playback issues');
    }
  }

  private async downloadDirect(url: string, filename: string, downloadDir: string, referer?: string): Promise<void> {
    const outputPath = path.join(downloadDir, `${filename}.mp4`);

    if (this.config.useAria2c && await this.commandExists('aria2c')) {
      await this.runAria2c(url, outputPath, referer);
    } else if (await this.commandExists('wget')) {
      await this.runWget(url, outputPath, referer);
    } else if (await this.commandExists('curl')) {
      await this.runCurl(url, outputPath, referer);
    } else {
      console.log(`\x1b[1;33m⚠ No download tools available (aria2c, wget, curl)\x1b[0m`);
      console.log(`\x1b[1;33m  Would download: ${url}\x1b[0m`);
      console.log(`\x1b[1;33m  To: ${outputPath}\x1b[0m`);
      console.log(`\x1b[1;33m  Install aria2c, wget, or curl to enable actual downloads\x1b[0m`);
    }
  }


  private async runYtDlpWithFFmpeg(url: string, outputPath: string, referer?: string): Promise<void> {
    const args = [
      '--downloader', 'ffmpeg',
      '--no-skip-unavailable-fragments',
      '--fragment-retries', 'infinite',
      '-N', '16',
      '-o', outputPath
    ];

    if (referer) {
      args.push('--referer', referer);
    }

    args.push(url);

    return this.runCommand('yt-dlp', args);
  }

  private async runFFmpeg(url: string, outputPath: string, referer?: string): Promise<void> {
    const args = [
      '-extension_picky', '0',
      '-loglevel', 'error',
      '-stats',
      '-i', url,
      '-c', 'copy',
      outputPath
    ];

    if (referer) {
      args.splice(2, 0, '-referer', referer);
    }

    return this.runCommand('ffmpeg', args);
  }

  private async runAria2c(url: string, outputPath: string, referer?: string): Promise<void> {
    const dir = path.dirname(outputPath);
    const filename = path.basename(outputPath);

    const args = [
      '--enable-rpc=false',
      '--check-certificate=false',
      '--continue',
      '--summary-interval=0',
      '-x', '16',
      '-s', '16',
      '--dir', dir,
      '-o', filename,
      '--download-result=hide'
    ];

    if (referer) {
      args.push('--referer', referer);
    }

    args.push(url);

    return this.runCommand('aria2c', args);
  }

  private async runWget(url: string, outputPath: string, referer?: string): Promise<void> {
    const args = [
      '--continue',
      '--timeout=30',
      '--tries=3',
      '--output-document', outputPath
    ];

    if (referer) {
      args.push('--referer', referer);
    }

    args.push(url);

    return this.runCommand('wget', args);
  }

  private async runCurl(url: string, outputPath: string, referer?: string): Promise<void> {
    const args = [
      '--location',
      '--continue-at', '-',
      '--output', outputPath
    ];

    if (referer) {
      args.push('--referer', referer);
    }

    args.push(url);

    return this.runCommand('curl', args);
  }

  private async runCommand(command: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { stdio: 'inherit' });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`${command} exited with code ${code}`));
        }
      });

      child.on('error', (error) => {
        reject(error);
      });
    });
  }

  private async validateVideoUrl(url: string, referer?: string): Promise<boolean> {
    try {
      const response = await axios.head(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
          ...(referer && { 'Referer': referer })
        },
        timeout: 10000,
        validateStatus: () => true // Accept any status code
      });

      const contentType = response.headers['content-type']?.toLowerCase() || '';
      const contentLength = parseInt(response.headers['content-length'] || '0');

      // Check if it's a video file, m3u8 playlist, or large binary content
      if (contentType.includes('video/') ||
        contentType.includes('application/octet-stream') ||
        contentType.includes('binary/octet-stream') ||
        contentType.includes('application/vnd.apple.mpegurl') || // m3u8 files
        contentType.includes('application/x-mpegurl') || // m3u8 files (alternative)
        contentType.includes('text/plain') && url.includes('m3u8') || // some servers return text/plain for m3u8
        (contentLength > 1000000)) { // > 1MB likely video
        console.log(`\x1b[1;32m  ✓ Valid video content detected (${contentType}, ${contentLength} bytes)\x1b[0m`);
        return true;
      }

      // If HEAD fails, try a small GET request
      if (response.status >= 400) {
        const getResponse = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
            ...(referer && { 'Referer': referer }),
            'Range': 'bytes=0-1023' // Only get first 1KB
          },
          timeout: 10000,
          validateStatus: () => true
        });

        const getContentType = getResponse.headers['content-type']?.toLowerCase() || '';
        if (getContentType.includes('video/') || getContentType.includes('application/octet-stream')) {
          console.log(`\x1b[1;32m  ✓ Valid video content detected via GET (${getContentType})\x1b[0m`);
          return true;
        }

        // Check if response looks like HTML
        const responseText = getResponse.data.toString().toLowerCase();
        if (responseText.includes('<!doctype html') || responseText.includes('<html')) {
          console.log(`\x1b[1;33m  ✗ URL returns HTML content instead of video\x1b[0m`);
          return false;
        }
      }

      console.log(`\x1b[1;33m  ✗ Content type: ${contentType}, Size: ${contentLength} bytes\x1b[0m`);
      return false;
    } catch (error: any) {
      console.log(`\x1b[1;33m  ⚠ Could not validate URL: ${error.message || error}\x1b[0m`);
      return false; // Assume invalid if we can't validate
    }
  }

  private async commandExists(command: string): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn('which', [command], { stdio: 'ignore' });
      child.on('close', (code) => {
        resolve(code === 0);
      });
      child.on('error', () => {
        resolve(false);
      });
    });
  }
}