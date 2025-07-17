import axios from 'axios';
import { AnimeInfo } from './types';

export class AnimeScraper {
  private agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0';
  private allanimeRefr = 'https://allmanga.to';
  private allanimeBase = 'allanime.day';
  private allanimeApi = `https://api.${this.allanimeBase}`;

  private decodeProviderId(encodedId: string): string {
    // Remove the -- prefix if present
    const cleanId = encodedId.startsWith('--') ? encodedId.slice(2) : encodedId;
    
    // Split into hex pairs and decode using the mapping from original ani-cli
    const hexPairs = cleanId.match(/.{2}/g) || [];
    const decoded = hexPairs.map(hex => {
      switch (hex) {
        case '79': return 'A';
        case '7a': return 'B';
        case '7b': return 'C';
        case '7c': return 'D';
        case '7d': return 'E';
        case '7e': return 'F';
        case '7f': return 'G';
        case '70': return 'H';
        case '71': return 'I';
        case '72': return 'J';
        case '73': return 'K';
        case '74': return 'L';
        case '75': return 'M';
        case '76': return 'N';
        case '77': return 'O';
        case '68': return 'P';
        case '69': return 'Q';
        case '6a': return 'R';
        case '6b': return 'S';
        case '6c': return 'T';
        case '6d': return 'U';
        case '6e': return 'V';
        case '6f': return 'W';
        case '60': return 'X';
        case '61': return 'Y';
        case '62': return 'Z';
        case '59': return 'a';
        case '5a': return 'b';
        case '5b': return 'c';
        case '5c': return 'd';
        case '5d': return 'e';
        case '5e': return 'f';
        case '5f': return 'g';
        case '50': return 'h';
        case '51': return 'i';
        case '52': return 'j';
        case '53': return 'k';
        case '54': return 'l';
        case '55': return 'm';
        case '56': return 'n';
        case '57': return 'o';
        case '48': return 'p';
        case '49': return 'q';
        case '4a': return 'r';
        case '4b': return 's';
        case '4c': return 't';
        case '4d': return 'u';
        case '4e': return 'v';
        case '4f': return 'w';
        case '40': return 'x';
        case '41': return 'y';
        case '42': return 'z';
        case '08': return '0';
        case '09': return '1';
        case '0a': return '2';
        case '0b': return '3';
        case '0c': return '4';
        case '0d': return '5';
        case '0e': return '6';
        case '0f': return '7';
        case '00': return '8';
        case '01': return '9';
        case '15': return '-';
        case '16': return '.';
        case '67': return '_';
        case '46': return '~';
        case '02': return ':';
        case '17': return '/';
        case '07': return '?';
        case '1b': return '#';
        case '63': return '[';
        case '65': return ']';
        case '78': return '@';
        case '19': return '!';
        case '1c': return '$';
        case '1e': return '&';
        case '10': return '(';
        case '11': return ')';
        case '12': return '*';
        case '13': return '+';
        case '14': return ',';
        case '03': return ';';
        case '05': return '=';
        case '1d': return '%';
        default: return '';
      }
    }).join('');

    // Append /clock.json as in the original script
    return decoded.replace('/clock', '/clock.json');
  }

  async searchAnime(query: string, mode: 'sub' | 'dub' = 'sub'): Promise<AnimeInfo[]> {
    const searchGql = `query( $search: SearchInput $limit: Int $page: Int $translationType: VaildTranslationTypeEnumType $countryOrigin: VaildCountryOriginEnumType ) { shows( search: $search limit: $limit page: $page translationType: $translationType countryOrigin: $countryOrigin ) { edges { _id name availableEpisodes __typename } }}`;

    const variables = {
      search: { allowAdult: false, allowUnknown: false, query },
      limit: 40,
      page: 1,
      translationType: mode,
      countryOrigin: 'ALL'
    };

    try {
      const url = `${this.allanimeApi}/api`;
      const params = new URLSearchParams({
        variables: JSON.stringify(variables),
        query: searchGql
      });

      const response = await axios.get(`${url}?${params.toString()}`, {
        headers: {
          'User-Agent': this.agent,
          'Referer': this.allanimeRefr
        }
      });

      // Parse response and extract results
      const responseData = response.data;
      let results: AnimeInfo[] = [];

      if (responseData.data?.shows?.edges) {
        // Handle JSON response
        const shows = responseData.data.shows.edges;
        results = shows.map((show: any) => ({
          id: show._id,
          title: `${show.name} (${show.availableEpisodes?.[mode] || 0} episodes)`,
          episode: '',
          episodeUrl: ''
        }));
      }

      return results;
    } catch (error) {
      console.error('Search failed:', error);
      return [];
    }
  }

  async getEpisodesList(showId: string, mode: 'sub' | 'dub' = 'sub'): Promise<string[]> {
    const episodesListGql = `query ($showId: String!) { show( _id: $showId ) { _id availableEpisodesDetail }}`;

    const variables = { showId };

    try {
      const url = `${this.allanimeApi}/api`;
      const params = new URLSearchParams({
        variables: JSON.stringify(variables),
        query: episodesListGql
      });

      const response = await axios.get(`${url}?${params.toString()}`, {
        headers: {
          'User-Agent': this.agent,
          'Referer': this.allanimeRefr
        }
      });

      const responseData = response.data;
      let episodes: string[] = [];

      if (responseData.data?.show?.availableEpisodesDetail?.[mode]) {
        episodes = responseData.data.show.availableEpisodesDetail[mode]
          .sort((a: string, b: string) => parseFloat(a) - parseFloat(b));
      }

      return episodes;
    } catch (error: any) {
      console.error('Failed to get episodes list:', error);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      return [];
    }
  }

  async getEpisodeUrl(showId: string, episodeString: string, mode: 'sub' | 'dub' = 'sub'): Promise<{ url: string, subtitle?: string, referer?: string }> {
    const episodeEmbedGql = `query ($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) { episode( showId: $showId translationType: $translationType episodeString: $episodeString ) { episodeString sourceUrls }}`;


    const variables = {
      showId,
      translationType: mode,
      episodeString
    };

    try {
      const url = `${this.allanimeApi}/api`;
      const params = new URLSearchParams({
        variables: JSON.stringify(variables),
        query: episodeEmbedGql
      });

      const response = await axios.get(`${url}?${params.toString()}`, {
        headers: {
          'User-Agent': this.agent,
          'Referer': this.allanimeRefr
        }
      });

      // Parse the actual response and extract source URLs
      const responseData = response.data;

      console.log(`\\x1b[1;36mFound ${responseData.data?.episode?.sourceUrls?.length || 0} source(s) for episode ${episodeString}\\x1b[0m`);

      if (responseData.data?.episode?.sourceUrls) {
        const sourceUrls = responseData.data.episode.sourceUrls;
        if (sourceUrls.length > 0) {
          // Available sources with their priorities and types

          // Sort by priority (higher is better)
          const sortedSources = sourceUrls.sort((a: any, b: any) => (b.priority || 0) - (a.priority || 0));

          // Look for encoded sources first (these are the most reliable)
          for (const source of sortedSources) {
            if (source.sourceUrl && source.sourceUrl.startsWith('--')) {
              console.log(`\x1b[1;36m→ Found encoded source from ${source.sourceName} (priority: ${source.priority})\x1b[0m`);
              try {
                const decodedUrl = this.decodeProviderId(source.sourceUrl);
                const fullUrl = `https://${this.allanimeBase}${decodedUrl}`;
                console.log(`\x1b[1;32m→ Decoded URL: ${fullUrl}\x1b[0m`);
                
                // Fetch the actual video links from the decoded URL
                const videoLinksResponse = await axios.get(fullUrl, {
                  headers: {
                    'User-Agent': this.agent,
                    'Referer': this.allanimeRefr
                  }
                });
                
                const videoData = videoLinksResponse.data;
                if (videoData.links && videoData.links.length > 0) {
                  // Return the first available link
                  const videoLink = videoData.links[0];
                  console.log(`\x1b[1;32m→ Found video link: ${videoLink.link}\x1b[0m`);
                  return {
                    url: videoLink.link,
                    subtitle: undefined,
                    referer: this.allanimeRefr
                  };
                } else {
                  console.log(`\x1b[1;31m→ No video links found in response\x1b[0m`);
                  continue;
                }
              } catch (error) {
                console.log(`\x1b[1;31m→ Failed to decode ${source.sourceName}: ${error}\x1b[0m`);
                continue;
              }
            }
          }

          // Fall back to download URLs (these often don't work directly)
          for (const source of sortedSources) {
            if (source.downloads?.downloadUrl) {
              console.log(`\x1b[1;33m→ Trying download URL from ${source.sourceName} (may not work)\x1b[0m`);
              return {
                url: source.downloads.downloadUrl,
                subtitle: undefined,
                referer: this.allanimeRefr
              };
            }
          }

          // Last resort: iframe embeds (these usually don't work for direct download)
          for (const source of sortedSources) {
            if (source.sourceUrl && !source.sourceUrl.startsWith('--')) {
              console.log(`\x1b[1;31m→ Using iframe embed from ${source.sourceName} (may not work)\x1b[0m`);
              return {
                url: source.sourceUrl.startsWith('//') ? `https:${source.sourceUrl}` : source.sourceUrl,
                subtitle: undefined,
                referer: this.allanimeRefr
              };
            }
          }

          // If no usable sources found in the array
          console.log('\x1b[1;31mNo usable sources found in response\x1b[0m');
        } else {
          console.log('\x1b[1;31mNo sources in response (empty array)\x1b[0m');
        }
      } else {
        console.log('\x1b[1;31mNo episode data in API response\x1b[0m');
        console.log('Response structure:', JSON.stringify(responseData, null, 2));
      }

      throw new Error('No sources available for this episode');
    } catch (error: any) {
      console.error('Failed to get episode URL:', error);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
        console.error('Request URL:', error.config?.url);
      }
      throw error;
    }
  }
}