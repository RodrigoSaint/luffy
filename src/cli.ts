import enquirer from 'enquirer';
import { CLIOptions, DownloadConfig } from './types.ts';
import { AnimeScraper } from './scraper.ts';
import { Downloader } from './downloader.ts';
import { Imdb, LufyResult, mapToLufyResult } from './imdb.ts';
import path from 'node:path';
import fs from 'node:fs';

export class CLI {
  private scraper: AnimeScraper;
  private downloader: Downloader;
  private config: DownloadConfig;
  private imdb: Imdb;

  constructor() {
    this.scraper = new AnimeScraper();
    this.config = {
      downloadDir: process.env.ANI_CLI_DOWNLOAD_DIR || process.cwd(),
      quality: process.env.ANI_CLI_QUALITY || 'best',
      mode: (process.env.ANI_CLI_MODE as 'sub' | 'dub') || 'sub',
      useYtDlp: true,
      useAria2c: true
    };
    this.downloader = new Downloader(this.config);
    this.imdb = new Imdb();
  }

  async selectImdbResult(query: string) {
    const imdbResults = await this.imdb.search(query);

    if (imdbResults.length === 0) {
      console.log('\x1b[1;31mNo results found!\x1b[0m');
      return;
    }

    const { result: resultId } = await enquirer.prompt<{ result: string }>({
      type: 'select',
      name: 'result',
      message: 'Select result:',
      choices: imdbResults.map(result => ({ name: `${result.l} [${result.y}]`, value: result.id })),
      result(name: string) {
        const title = name.split(' [')[0]
        return imdbResults.find(c => c.l === title)?.id || title;
      },
      initial: 0,
    }) as any;

    const result = imdbResults.find(result => result.id === resultId || result.l === resultId)

    return mapToLufyResult(result!)
  }

  async selectSeason(imdbResult: LufyResult) {
    const seasons = await this.imdb.fetchSeasons(imdbResult.id);

    const { result: season } = await enquirer.prompt<{ result: string }>({
      type: 'select',
      name: 'result',
      message: 'Select season:',
      choices: new Array(seasons).fill(0).map((_, i) => ({ name: `Season ${i + 1}`, value: i + 1 })),
      result(name: string) {
        return name;
      },
      initial: 0,
    }) as any;

    return parseInt(season.replace('Season ', ''))
  }

  async selectImdbEpisodes(imdbResult: LufyResult, season: number) {
    const episodes = await this.imdb.fetchEpisodes(imdbResult.id, season)

    const choices = episodes.map(ep => ({ name: `Episode ${ep.episode}`, value: ep.episode }))

    const rawResponse = await enquirer.prompt<{ episodes: string[] }>({
      type: 'multiselect',
      name: 'episodes',
      message: 'Select episodes to download:',
      choices
    });

    // Map display names back to episode numbers
    const response = {
      episodes: rawResponse.episodes.map(name => {
        const choice = choices.find(c => c.name === name);
        return choice ? choice.value : name;
      })
    };

    if (response.episodes.length === 0) {
      throw new Error('No episodes selected');
    }

    return response.episodes;
  }

  async createDownloadDir(imdbResult: LufyResult, season: number) {
    const downloadDir = path.join(`${imdbResult.title} (${imdbResult.year})`, `Season ${season.toString().padStart(2, '0')}`)
    fs.mkdirSync(downloadDir, { recursive: true })
    return downloadDir
  }

  async run(options: CLIOptions = {}): Promise<void> {
    try {
      console.log('\x1b[1;34mani-cli TypeScript Downloader\x1b[0m');
      console.log('===============================\n');

      // Get search query
      const query = await this.getSearchQuery(options.query);

      const imdbResult = await this.selectImdbResult(query);

      if (!imdbResult) {
        console.log('\x1b[1;31mNo results found!\x1b[0m');
        return;
      }

      const season = await this.selectSeason(imdbResult);

      if (!season) {
        console.log('\x1b[1;31mNo season found!\x1b[0m');
        return;
      }

      const imdbEpisodes = await this.selectImdbEpisodes(imdbResult, season)

      if (imdbEpisodes.length === 0) {
        console.log('\x1b[1;31mNo episodes found!\x1b[0m');
        return;
      }

      console.log('\x1b[1;36mSearching for anime...\x1b[0m');
      const searchResults = await this.scraper.searchAnime(query, this.config.mode);

      if (searchResults.length === 0) {
        console.log('\x1b[1;31mNo results found!\x1b[0m');
        return;
      }

      // Select anime
      const selectedAnime = await this.selectAnime(searchResults);

      // Get episodes list
      console.log('\x1b[1;36mFetching episodes...\x1b[0m');
      const episodes = await this.scraper.getEpisodesList(selectedAnime.id, this.config.mode);

      if (episodes.length === 0) {
        console.log('\x1b[1;31mNo episodes found!\x1b[0m');
        return;
      }

      const selectedEpisodes = episodes.filter(ep => imdbEpisodes.includes(ep))

      const downloadDir = await this.createDownloadDir(imdbResult, season)

      await this.configureDownload(downloadDir);

      for (const episode of selectedEpisodes) {
        await this.downloadEpisode(selectedAnime.id, selectedAnime.title, episode);
      }

      console.log('\x1b[1;32mDownload completed!\x1b[0m');
    } catch (error) {
      console.error('\x1b[1;31mError:\x1b[0m', error);
      process.exit(1);
    }
  }

  private async getSearchQuery(providedQuery?: string): Promise<string> {
    if (providedQuery) {
      return providedQuery;
    }

    const response = await enquirer.prompt<{ query: string }>({
      type: 'input',
      name: 'query',
      message: 'Search anime:',
      validate: (value: string) => value.trim().length > 0 || 'Please enter a search query'
    });

    return response.query;
  }

  private async selectAnime(animeList: any[]): Promise<any> {
    const choices = animeList.map((anime, index) => ({
      name: anime.title,
      value: anime,
      hint: `ID: ${anime.id}`
    }));

    const response = await enquirer.prompt<{ anime: any }>({
      type: 'select',
      name: 'anime',
      message: 'Select anime:',
      choices,
      result(name: string) {
        return choices.find(c => c.name === name)?.value || name;
      }
    });

    return response.anime;
  }

  private async configureDownload(downloadDir?: string): Promise<void> {
    const qualityChoices = [
      { name: 'Best available', value: 'best' },
      { name: 'Worst available', value: 'worst' },
      { name: '1080p', value: '1080' },
      { name: '720p', value: '720' },
      { name: '480p', value: '480' }
    ];

    const modeChoices = [
      { name: 'Subtitled', value: 'sub' },
      { name: 'Dubbed', value: 'dub' }
    ];

    const qualityResponse = await enquirer.prompt({
      type: 'select',
      name: 'quality',
      message: 'Select quality:',
      choices: qualityChoices,
      initial: this.config.quality === 'best' ? 0 : 1,
      result(name: string) {
        return qualityChoices.find(c => c.name === name)?.value || name;
      }
    }) as any;

    const modeResponse = await enquirer.prompt({
      type: 'select',
      name: 'mode',
      message: 'Select audio:',
      choices: modeChoices,
      initial: this.config.mode === 'sub' ? 0 : 1,
      result(name: string) {
        return modeChoices.find(c => c.name === name)?.value || name;
      }
    }) as any;

    this.config.quality = qualityResponse.quality;
    this.config.mode = modeResponse.mode;

    if (downloadDir) {
      this.config.downloadDir = downloadDir;
      return
    }

    const dirResponse = await enquirer.prompt({
      type: 'input',
      name: 'downloadDir',
      message: 'Download directory:',
      initial: this.config.downloadDir,
      validate: (value: string) => {
        if (!value.trim()) return 'Please enter a directory path';
        return true;
      }
    }) as any;

    this.config.downloadDir = dirResponse.downloadDir;

  }

  private async downloadEpisode(animeId: string, animeTitle: string, episode: string): Promise<void> {
    console.log(`\x1b[1;34mDownloading episode ${episode}...\x1b[0m`);

    try {
      const episodeData = await this.scraper.getEpisodeUrl(animeId, episode, this.config.mode);

      const filename = `Episode ${episode.toString().padStart(2, '0')}`;

      await this.downloader.download({
        url: episodeData.url,
        filename,
        downloadDir: this.config.downloadDir,
        subtitle: episodeData.subtitle,
        referer: episodeData.referer
      });

      console.log(`\x1b[1;32m✓ Downloaded: ${filename}.mp4\x1b[0m`);
    } catch (error) {
      console.error(`\x1b[1;31m✗ Failed to download episode ${episode}:\x1b[0m`, error);
    }
  }
}