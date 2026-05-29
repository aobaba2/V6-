export interface CMSSource {
  id: string;
  name: string;
  url: string;
  status: 'active' | 'inactive';
}

export interface M3U8Parser {
  id: string;
  name: string;
  url: string; // e.g., https://jx.player.com/?url= OR https://api.json.com/play?url=
  type: 'iframe' | 'json_api'; // Use iframe embed or query json api
  status: 'active' | 'inactive';
}

export interface ScrapingRules {
  titleKey: string;       // e.g., 'vod_name'
  picKey: string;         // e.g., 'vod_pic'
  categoryKey: string;    // e.g., 'type_name'
  playUrlKey: string;     // e.g., 'vod_play_url'
  remarksKey: string;     // e.g., 'vod_remarks'
  contentKey: string;     // e.g., 'vod_content'
  playFromServerKey: string; // e.g., 'vod_play_from'
  splitPlayServer: string; // e.g., '$$$'
  splitPlayEpisode: string; // e.g., '#'
  splitPlayNameAndUrl: string; // e.g., '$'
}

export interface IptvChannel {
  id: string;
  name: string;
  url: string;
  group?: string;
  logo?: string;
  status: 'active' | 'inactive';
}

export interface AppSettings {
  cmsSources: CMSSource[];
  m3u8Parsers: M3U8Parser[];
  rules: ScrapingRules;
  selectedCmsId: string;
  selectedParserId: string; // Can be 'internal' or references an ID
  iptvSources?: IptvChannel[];
}

export interface VideoItem {
  id: string | number;
  name: string;
  pic: string;
  category: string;
  remarks: string;
  content: string;
  playFrom: string;
  playUrl: string;
  year?: string;
  area?: string;
  lang?: string;
  director?: string;
  actor?: string;
}

export interface CategoryItem {
  id: string | number;
  name: string;
}

export interface WatchHistoryItem {
  id: string | number;
  name: string;
  pic: string;
  category: string;
  remarks: string;
  cmsId: string;
  playFrom: string;
  playUrl: string;
  lastPlayedServerName: string;
  lastPlayedEpisodeName: string;
  lastPlayedEpisodeUrl: string;
  lastPlayedServerIndex: number;
  lastPlayedEpisodeIndex: number;
  progressTime?: number;
  updatedAt: number;
  content?: string;
  year?: string;
  area?: string;
  lang?: string;
  director?: string;
  actor?: string;
}

export interface CMSResponse {
  code: number;
  msg: string;
  page: number;
  pagecount: number;
  limit: number;
  total: number;
  list: VideoItem[];
  class?: CategoryItem[];
}
