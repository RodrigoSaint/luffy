#!/usr/bin/env node

import { program } from 'commander';
import { CLI } from './cli';
import { CLIOptions } from './types';
import * as packageJson from '../package.json';

program
  .name('ani-cli-ts')
  .description('TypeScript implementation of ani-cli download functionality')
  .version(packageJson.version);

program
  .option('-q, --query <query>', 'anime search query')
  .option('-e, --episode <episode>', 'episode number or range (e.g., "5" or "1-10")')
  .option('--quality <quality>', 'video quality (best, worst, 1080, 720, 480)', 'best')
  .option('-d, --download-dir <dir>', 'download directory', process.cwd())
  .option('--mode <mode>', 'audio mode (sub, dub)', 'sub')
  .option('--dub', 'use dubbed audio (shorthand for --mode dub)')
  .action(async (options) => {
    try {
      const cli = new CLI();

      const cliOptions: CLIOptions = {
        query: options.query,
        episode: options.episode,
        quality: options.quality,
        downloadDir: options.downloadDir,
        mode: options.dub ? 'dub' : options.mode
      };

      // Set environment variables if provided
      if (options.downloadDir) {
        process.env.ANI_CLI_DOWNLOAD_DIR = options.downloadDir;
      }
      if (options.quality) {
        process.env.ANI_CLI_QUALITY = options.quality;
      }
      if (options.mode || options.dub) {
        process.env.ANI_CLI_MODE = options.dub ? 'dub' : options.mode;
      }

      await cli.run(cliOptions);
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

// Add help examples
program.on('--help', () => {
  console.log('');
  console.log('Examples:');
  console.log('  $ ani-cli-ts                          # Interactive mode');
  console.log('  $ ani-cli-ts -q "one piece"           # Search for "one piece"');
  console.log('  $ ani-cli-ts -q "naruto" -e 1-5       # Download episodes 1-5');
  console.log('  $ ani-cli-ts -q "attack on titan" --dub # Search for dubbed version');
  console.log('  $ ani-cli-ts -q "demon slayer" --quality 720 -d ./downloads');
  console.log('');
});

program.parse();