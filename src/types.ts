export interface DownloadOptions {
  url: string;
  filename: string;
  downloadDir: string;
  subtitle?: string;
  referer?: string;
  m3u8Referer?: string;
}

export interface AnimeInfo {
  id: string;
  title: string;
  episode: string;
  episodeUrl: string;
  subtitle?: string;
}

export interface DownloadConfig {
  downloadDir: string;
  quality: string;
  mode: 'sub' | 'dub';
  useYtDlp: boolean;
  useAria2c: boolean;
}

export interface CLIOptions {
  query?: string;
  episode?: string;
  quality?: string;
  downloadDir?: string;
  mode?: 'sub' | 'dub';
}