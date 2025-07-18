import axios from 'axios';

interface ImdbSearchResult {
  i: {
    height: number;
    imageUrl: string;
    width: number;
  };
  id: string;
  l: string;
  q: string;
  qid: "tvSeries" | "movie";
  rank: number;
  s: string;
  y: number;
  yr: string;
}

interface ImdbEpisodesQuery {
  pageProps: {
    contentData: {
      data: {
        title: {
          episodes: {
            displayableSeasons: {
              total: number;
            }
          }
        }
      },
      section: {
        episodes: {
          total: number;
          items: {
            id: string;
            season: number;
            episode: number
          }[]
        }
      }
    }
  }
}

export interface LufyResult {
  id: string;
  title: string;
  subtitle?: string;
  year: number;
  image: string;
  rating: number;
  type: "tvSeries" | "movie";
}

export class Imdb {
  private buildId: string | null = null;

  async search(query: string): Promise<ImdbSearchResult[]> {
    const firstLetter = query.charAt(0).toLowerCase();
    const encodedQuery = encodeURIComponent(query);
    const path = `https://v3.sg.media-imdb.com/suggestion/${firstLetter}/${encodedQuery}.json`
    const response = await axios.get<{ d: ImdbSearchResult[] }>(path);
    return response.data.d;
  }

  private async getBuildId(): Promise<string> {
    if (this.buildId) {
      return this.buildId;
    }

    try {
      const response = await axios.get('https://www.imdb.com/', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });

      const html = response.data;

      // Look for build ID in various places
      const buildIdPatterns = [
        /"buildId":"([^"]+)"/,
        /_next\/static\/([^\/]+)\//,
        /\/_next\/data\/([^\/]+)\//,
        /"BUILD_ID":"([^"]+)"/
      ];

      for (const pattern of buildIdPatterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          this.buildId = match[1];
          return this.buildId!;
        }
      }

      throw new Error('Could not find build ID in IMDB homepage');
    } catch (error) {
      console.error('Failed to get build ID:', error);
      // Fallback to hardcoded build ID
      this.buildId = '2fLRQQeUg5eN_4NE3Hsq-';
      console.log('Using fallback build ID:', this.buildId);
      return this.buildId;
    }
  }

  private getRequestHeaders() {
    return {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Cookie': 'session-id=139-3523295-2237269; session-id-time=2082787201l; ubid-main=132-7714966-6818008; ad-oo=0; ci=eyJhY3QiOiJDUVVzbUlBUVVzbUlBRjRBQkNFTmhDLWdBQUFBQUFBQUFCYWdBQVFBQUFBZ0FBQUEiLCJnY3QiOiJDUVVzbUlBUVVzbUlBRjRBQkNFTkJ6RmdBQUFBQUFBQUFCYWdBQVFBQUFBZ0FBRkFvQU1BQVFmUUNRQVlBQWctZ09nQXdBQkI5QWxBQmdBQ0Q2QlNBREFBRUgwQXdBR0FBSVBvQ2dBTUFBUWZRR0FBWUFBZy1nUUFBd0FCQjlBUUFQQUJBQUNRQUZRQU5ZQXdnREVBR1lBT1lBZ0FCU2dEVkFKYUFWa0Fyd0J3Z0ZoZy5ZQUFBQUFBQUFBQSIsInB1cnBvc2VzIjpbXSwidmVuZG9ycyI6W10sImlzR2RwciI6dHJ1ZX0; csm-hit=tb:s-18500VPK3DKKRQX836K4|1752747452457&t:1752747452751&adb:adblk_no; session-token=7W8fzj/YxeAf/b2yq2QQkOQEob6kcTDImL3jaeaVoiCGsMnoqU0K4iuM7+G12b5cqF5IxI1ooqy6n4DXACdf/RqZrTCJ9QvJ4tm20uYpPuXl/P+eYaZDcgHEO5fYFqUewC9Smh5ewWZkfp5uoVnjg3R+YkYn6umlTlY6suk3ndvE2HuciJ1tGcwqhRxaW8DdFjFo1F7zSgEmEnZ17OQ9o8exGB4Wbfo0eQrW3/hUK4QPQiyQejmUvAe4Udd66tu5ReCsvmkLI+n0CwHTs1KBL9bGSLz9yg+CQs5OY97MZ+iS0HpjyE2JgwIURt8hm2kFxeGkPelleTPsGxi1tL31HGe0LhWABbrf'
    };
  }

  async fetchSeasons(id: string) {
    const buildId = await this.getBuildId();
    const path = `https://www.imdb.com/_next/data/${buildId}/en-US/title/${id}/episodes.json?season=1&ref_=ttep&tconst=${id}`
    const response = await axios.get<ImdbEpisodesQuery>(path, {
      headers: this.getRequestHeaders()
    });

    return response.data.pageProps.contentData.data.title.episodes.displayableSeasons.total;
  }

  async fetchEpisodes(id: string, season: number) {
    const buildId = await this.getBuildId();
    const path = `https://www.imdb.com/_next/data/${buildId}/en-US/title/${id}/episodes.json?season=${season}&ref_=ttep&tconst=${id}`
    const response = await axios.get<ImdbEpisodesQuery>(path, {
      headers: this.getRequestHeaders()
    });
    return response.data.pageProps.contentData.section.episodes.items;
  }
}

export const mapToLufyResult = (result: ImdbSearchResult): LufyResult => {
  return {
    id: result.id,
    title: result.l,
    subtitle: result.s,
    year: result.y,
    image: result.i.imageUrl,
    rating: result.rank,
    type: result.qid,
  }
}
