import axios from 'axios';
import { createWriteStream, promises as fs } from 'fs';
import path from 'path';
const Parser = require('m3u8-parser').Parser;

export class HLSDownloader {
  private agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0';

  async downloadHLS(m3u8Url: string, outputPath: string, referer?: string): Promise<void> {
    console.log(`\x1b[1;36m→ Downloading HLS stream: ${m3u8Url}\x1b[0m`);
    
    // Step 1: Parse the master playlist
    const masterPlaylist = await this.fetchPlaylist(m3u8Url, referer);
    const parser = new Parser();
    parser.push(masterPlaylist);
    parser.end();

    if (!parser.manifest || !parser.manifest.playlists) {
      throw new Error('Invalid master playlist');
    }

    // Step 2: Get the best quality stream URL
    const streams = parser.manifest.playlists;
    const bestStream = streams.reduce((best: any, current: any) => 
      (current.attributes.BANDWIDTH > best.attributes.BANDWIDTH) ? current : best
    );

    console.log(`\x1b[1;36m→ Selected stream: ${bestStream.attributes.RESOLUTION?.width}x${bestStream.attributes.RESOLUTION?.height} (${Math.round(bestStream.attributes.BANDWIDTH / 1000)}kbps)\x1b[0m`);

    // Step 3: Get the segment playlist URL
    const segmentPlaylistUrl = this.resolveUrl(m3u8Url, bestStream.uri);
    const segmentPlaylist = await this.fetchPlaylist(segmentPlaylistUrl, referer);
    
    // Step 4: Parse segment playlist
    const segmentParser = new Parser();
    segmentParser.push(segmentPlaylist);
    segmentParser.end();

    if (!segmentParser.manifest || !segmentParser.manifest.segments) {
      throw new Error('Invalid segment playlist');
    }

    const segments = segmentParser.manifest.segments;
    console.log(`\x1b[1;36m→ Found ${segments.length} segments to download\x1b[0m`);

    // Step 5: Download all segments in parallel (in chunks to avoid overwhelming the server)
    const segmentBuffers: Buffer[] = new Array(segments.length);
    const chunkSize = 10; // Download 10 segments at a time
    
    for (let i = 0; i < segments.length; i += chunkSize) {
      const chunk = segments.slice(i, i + chunkSize);
      const chunkPromises = chunk.map(async (segment: any, chunkIndex: number) => {
        const segmentIndex = i + chunkIndex;
        const segmentUrl = this.resolveUrl(segmentPlaylistUrl, segment.uri);
        
        process.stdout.write(`\r\x1b[1;33m→ Downloading segments ${i + 1}-${Math.min(i + chunkSize, segments.length)}/${segments.length}...\x1b[0m`);
        
        const segmentData = await this.downloadSegment(segmentUrl, referer);
        segmentBuffers[segmentIndex] = segmentData;
      });
      
      await Promise.all(chunkPromises);
    }

    console.log(`\n\x1b[1;32m→ Combining ${segments.length} segments...\x1b[0m`);

    // Step 6: Combine all segments into final file
    await this.combineSegments(segmentBuffers, outputPath);
    
    console.log(`\x1b[1;32m✓ Successfully downloaded: ${path.basename(outputPath)}\x1b[0m`);
  }

  private async fetchPlaylist(url: string, referer?: string): Promise<string> {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': this.agent,
        ...(referer && { 'Referer': referer })
      },
      timeout: 10000
    });
    return response.data;
  }

  private async downloadSegment(url: string, referer?: string): Promise<Buffer> {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': this.agent,
        ...(referer && { 'Referer': referer })
      },
      responseType: 'arraybuffer',
      timeout: 30000
    });
    return Buffer.from(response.data);
  }

  private async combineSegments(segments: Buffer[], outputPath: string): Promise<void> {
    // Ensure output directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    
    // Write all segments to the output file
    const writeStream = createWriteStream(outputPath);
    
    return new Promise((resolve, reject) => {
      writeStream.on('error', reject);
      writeStream.on('finish', resolve);
      
      // Write each segment buffer
      for (const segment of segments) {
        writeStream.write(segment);
      }
      
      writeStream.end();
    });
  }

  private resolveUrl(baseUrl: string, relativeUrl: string): string {
    if (relativeUrl.startsWith('http')) {
      return relativeUrl;
    }
    
    const base = new URL(baseUrl);
    return new URL(relativeUrl, base).toString();
  }
}