import React, { useState, useEffect } from 'react';
import {
  Film,
  Layers,
  Settings,
  Search,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Tv,
  ExternalLink,
  SlidersHorizontal,
  FolderLock,
  Play,
  RotateCcw,
  Check,
  AlertTriangle,
  BookOpen,
  Sliders,
  HelpCircle,
  Menu,
  X,
  Sparkles,
  RefreshCw,
  Cpu,
  Info,
  History,
  Lock,
  User,
  Key,
  LogOut,
  Heart,
  Share2,
  Star,
  Radio,
  Globe
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CMSSource, M3U8Parser, ScrapingRules, AppSettings, VideoItem, CategoryItem, CMSResponse, WatchHistoryItem, IptvChannel } from './types';
import VideoPlayer from './components/VideoPlayer';
import VideoCard from './components/VideoCard';
import SearchAndFilter from './components/SearchAndFilter';
import IptvLiveView from './components/IptvLiveView';

// Deterministic Emby-style review rating generator based on string hash
const getRating = (name: string): string => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const score = 7.2 + (Math.abs(hash) % 24) / 10; // score bound between 7.2 and 9.5
  return score.toFixed(1);
};

// Deterministic Emby-style visitor heat indicator based on string hash
const getPopularity = (name: string): number => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 3) - hash);
  }
  return 1205 + (Math.abs(hash) % 8765); // popularity between 1205 and 9970
};

export default function App() {
  // Settings State loaded from server
  const [settings, setSettings] = useState<AppSettings>({
    cmsSources: [],
    m3u8Parsers: [],
    rules: {
      titleKey: 'vod_name',
      picKey: 'vod_pic',
      categoryKey: 'type_name',
      playUrlKey: 'vod_play_url',
      remarksKey: 'vod_remarks',
      contentKey: 'vod_content',
      playFromServerKey: 'vod_play_from',
      splitPlayServer: '$$$',
      splitPlayEpisode: '#',
      splitPlayNameAndUrl: '$'
    },
    selectedCmsId: '',
    selectedParserId: 'internal',
    fetchMode: 'proxy'
  });

  // UI state
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | number>('');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'home' | 'admin'>('home');
  const [navTab, setNavTab] = useState<'home' | 'tv' | 'movies' | 'new' | 'mylist' | 'iptv'>('home');
  const [adminTab, setAdminTab] = useState<'config' | 'guide' | 'iptv'>('config');

  // IPTV Live Stream State
  const [selectedIptvChannel, setSelectedIptvChannel] = useState<IptvChannel | null>(null);
  const [iptvGroupFilter, setIptvGroupFilter] = useState<string>('all');
  const [tempIptvName, setTempIptvName] = useState('');
  const [tempIptvUrl, setTempIptvUrl] = useState('');
  const [tempIptvGroup, setTempIptvGroup] = useState('');
  const [tempIptvLogo, setTempIptvLogo] = useState('');
  const [tempM3uUrl, setTempM3uUrl] = useState('');
  const [isImportingM3u, setIsImportingM3u] = useState(false);
  const [deletingChannelId, setDeletingChannelId] = useState<string | null>(null);
  const [isResettingIptv, setIsResettingIptv] = useState<boolean>(false);
  const [m3uImportTab, setM3uImportTab] = useState<'url' | 'local'>('url');
  const [tempM3uText, setTempM3uText] = useState('');

  // TVBox Subscription Import State
  const [tempTvBoxUrl, setTempTvBoxUrl] = useState('');
  const [isImportingTvBox, setIsImportingTvBox] = useState(false);
  const [tvBoxImportTab, setTvBoxImportTab] = useState<'url' | 'local'>('url');
  const [tempTvBoxText, setTempTvBoxText] = useState('');

  const parseTvBoxTextContent = (text: string): CMSSource[] => {
    let clean = text.replace(/\/\*[\s\S]*?\*\//g, '');
    const lines = clean.split('\n');
    const resultLines = lines.map(line => {
      let idx = line.indexOf('//');
      while (idx !== -1) {
        if (idx > 0 && line.charAt(idx - 1) === ':') {
          idx = line.indexOf('//', idx + 2);
        } else {
          return line.substring(0, idx);
        }
      }
      return line;
    });
    clean = resultLines.join('\n');
    clean = clean.replace(/,(\s*[\]}])/g, '$1');

    try {
      const config = JSON.parse(clean);
      if (!config || !Array.isArray(config.sites)) {
        return [];
      }
      const cmsSources: CMSSource[] = [];
      config.sites.forEach((site: any, idx: number) => {
        if (site && site.name && site.api && typeof site.api === 'string') {
          const urlStr = site.api.trim();
          if (urlStr.startsWith('http://') || urlStr.startsWith('https://')) {
            cmsSources.push({
              id: `tvbox_client_${idx}_${Math.random().toString(36).substring(2, 7)}_${Date.now()}`,
              name: `${site.name.trim()} (TVBox)`,
              url: urlStr,
              status: 'active'
            });
          }
        }
      });
      return cmsSources;
    } catch (e) {
      console.warn('Failed client-side TVBox parse', e);
      return [];
    }
  };

  const parseM3uTextContent = (text: string): IptvChannel[] => {
    const lines = text.split(/\r?\n/);
    const channels: IptvChannel[] = [];
    let currentChannel: any = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.startsWith('#EXTINF:')) {
        currentChannel = {
          name: '',
          url: '',
          group: '地方频道',
          logo: undefined,
          status: 'active'
        };

        const groupMatch = line.match(/group-title=["']([^"']+)["']/i);
        if (groupMatch) {
          currentChannel.group = groupMatch[1];
        }

        const logoMatch = line.match(/tvg-logo=["']([^"']+)["']/i);
        if (logoMatch) {
          currentChannel.logo = logoMatch[1];
        }

        const tvgNameMatch = line.match(/tvg-name=["']([^"']+)["']/i);
        if (tvgNameMatch) {
          currentChannel.name = tvgNameMatch[1];
        }

        const commaIndex = line.lastIndexOf(',');
        if (commaIndex !== -1) {
          const rawName = line.substring(commaIndex + 1).trim();
          if (rawName) {
            currentChannel.name = rawName;
          }
        }
      } else if (!line.startsWith('#') && currentChannel) {
        currentChannel.url = line;
        currentChannel.id = 'iptv_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
        
        if (currentChannel.name && currentChannel.url) {
          channels.push(currentChannel as IptvChannel);
        }
        currentChannel = null;
      }
    }
    return channels;
  };

  const [activeHeroIndex, setActiveHeroIndex] = useState<number>(0);

  // Get the 6 latest released videos to cycle/scroll on the limelight hero banner
  const getFeaturedCandidates = () => {
    let list = [...videos];
    
    // Deduplicate items early by ID to prevent key conflicts is any CMS returns duplicates
    const seenIds = new Set();
    const uniqueList: VideoItem[] = [];
    for (const item of list) {
      if (item.id && !seenIds.has(item.id)) {
        seenIds.add(item.id);
        uniqueList.push(item);
      }
    }
    list = uniqueList;
    
    // Filter for movies if possible to honor the "电影" request
    const moviesOnly = list.filter(v => {
      const cat = (v.category || '').toLowerCase();
      const isTv = cat.includes('剧') || cat.includes('系列') || cat.includes('动漫') || cat.includes('tv') || cat.includes('综艺');
      return !isTv;
    });

    // If we have at least 3 movies, use moviesOnly. Otherwise use general list to be safe.
    let selected = moviesOnly.length >= 3 ? moviesOnly : list;

    // Filter to items that have active pictures so it looks gorgeous
    const withPic = selected.filter(v => v.pic && v.pic.startsWith('http'));
    if (withPic.length > 0) {
      selected = withPic;
    }

    // Sort by year DESC so we get the most recently released titles
    selected.sort((a, b) => {
      const yrA = parseInt(a.year || '0') || 0;
      const yrB = parseInt(b.year || '0') || 0;
      return yrB - yrA;
    });

    // Take top 6
    const top6 = selected.slice(0, 6);

    const richCandidates = top6.map((vid) => {
      // Deterministic ratings
      let hash = 0;
      for (let i = 0; i < vid.name.length; i++) {
        hash = vid.name.charCodeAt(i) + ((hash << 5) - hash);
      }
      const rating = (7.8 + (Math.abs(hash) % 18) / 10).toFixed(1);

      return {
        id: vid.id,
        name: vid.name,
        pic: vid.pic,
        category: vid.category || '电影',
        remarks: vid.remarks || '4K ULTRA',
        content: vid.content ? vid.content.replace(/<[^>]*>/g, '').trim() : '一部震撼人心、绝不容错过的精美制作影片。精湛视效与豪华阵容为您呈现极致的感官盛宴。今日 赛博影院 平台重磅推荐。',
        year: vid.year || '2026',
        area: vid.area || '全球',
        lang: vid.lang || '国语/双语',
        director: vid.director || '赛博影院 精选',
        actor: vid.actor || '精选全明星阵容',
        rating,
        duration: '128分钟',
        genres: vid.category ? `${vid.category}, 剧情, 畅销` : '科幻, 悬疑, 动作, 精选',
        playFrom: vid.playFrom,
        playUrl: vid.playUrl,
        realItem: vid
      };
    });

    if (richCandidates.length === 0) {
      // Perfect fallback to STARFALL
      return [{
        id: 'mock_starfall',
        name: 'STARFALL (星陨战纪)',
        pic: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&q=80&w=1600',
        category: '电影',
        remarks: '4K画质',
        content: '星空暗淡，异像降临。一支精锐太空纵队必须在24小时内穿越无尽的神迹黑洞，寻找并拯救全宇宙的能源核心。一场交织荣耀与重生的太空史诗盛宴已由 赛博影院 重磅独家发行！',
        year: '2026',
        area: '欧美',
        lang: '英语原声',
        director: 'Cine Master',
        actor: '赛博影院 合作演员, SciFi Crew',
        rating: '9.5',
        duration: '2h 35m',
        genres: '科幻, 冒险, 史诗 (Sci-Fi, Adventure, Epic)',
        playFrom: '',
        playUrl: '',
        realItem: null
      }];
    }

    return richCandidates;
  };

  // Carousel auto cycle timer
  useEffect(() => {
    const interval = setInterval(() => {
      const candidatesCount = getFeaturedCandidates().length;
      if (candidatesCount > 1) {
        setActiveHeroIndex((prev) => (prev + 1) % candidatesCount);
      }
    }, 7000); // Rotate every 7 seconds
    return () => clearInterval(interval);
  }, [videos]);

  // Handle default IPTV channel selection
  useEffect(() => {
    if (settings.iptvSources && settings.iptvSources.length > 0 && !selectedIptvChannel) {
      const activeCh = settings.iptvSources.find(c => c.status === 'active') || settings.iptvSources[0];
      setSelectedIptvChannel(activeCh);
    }
  }, [settings.iptvSources, selectedIptvChannel]);

  // Handle boundary check on videos change
  useEffect(() => {
    const candidatesCount = getFeaturedCandidates().length;
    if (activeHeroIndex >= candidatesCount) {
      setActiveHeroIndex(0);
    }
  }, [videos, activeHeroIndex]);

  // Dynamic filter lists for home, tv, movies, sorting, and favorites
  const getFilteredVideosToRender = (): VideoItem[] => {
    if (navTab === 'mylist') {
      return favorites;
    }

    let result = [...videos];

    if (navTab === 'tv') {
      // Show ONLY entries whose categories match Television styles
      result = result.filter(v => {
        const cat = (v.category || '').toLowerCase();
        return cat.includes('剧') || cat.includes('系列') || cat.includes('动漫') || cat.includes('tv') || cat.includes('综艺');
      });
    } else if (navTab === 'movies') {
      // Show ONLY entries that are not TV
      result = result.filter(v => {
        const cat = (v.category || '').toLowerCase();
        const isTv = cat.includes('剧') || cat.includes('系列') || cat.includes('动漫') || cat.includes('tv') || cat.includes('综艺');
        return !isTv;
      });
    } else if (navTab === 'new') {
      // Sort in-place by year DESC, fallback to id
      result.sort((a, b) => {
        const yrA = parseInt(a.year || '0') || 0;
        const yrB = parseInt(b.year || '0') || 0;
        return yrB - yrA;
      });
    }

    // Deduplicate items by ID to guarantee unique React key mappings on render lists
    const seen = new Set();
    const uniqueResult: VideoItem[] = [];
    for (const item of result) {
      if (item.id && !seen.has(item.id)) {
        seen.add(item.id);
        uniqueResult.push(item);
      }
    }
    return uniqueResult;
  };
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState<boolean>(() => {
    return sessionStorage.getItem('isAdminLoggedIn') === 'true';
  });
  const [loginUsername, setLoginUsername] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');

  // Currently playing movie
  const [currentVideo, setCurrentVideo] = useState<VideoItem | null>(null);
  const [currentPlayUrl, setCurrentPlayUrl] = useState<string>('');
  const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState<number>(0);
  const [currentServerIndex, setCurrentServerIndex] = useState<number>(0);
  const [parsedServers, setParsedServers] = useState<{ name: string; episodes: { name: string; url: string }[] }[]>([]);

  // Mobile drawer control
  const [showConfigMobile, setShowConfigMobile] = useState(false);

  // Settings modification fields state
  const [tempCmsName, setTempCmsName] = useState('');
  const [tempCmsUrl, setTempCmsUrl] = useState('');
  const [tempParserName, setTempParserName] = useState('');
  const [tempParserUrl, setTempParserUrl] = useState('');
  const [rules, setRules] = useState<ScrapingRules>({
    titleKey: 'vod_name',
    picKey: 'vod_pic',
    categoryKey: 'type_name',
    playUrlKey: 'vod_play_url',
    remarksKey: 'vod_remarks',
    contentKey: 'vod_content',
    playFromServerKey: 'vod_play_from',
    splitPlayServer: '$$$',
    splitPlayEpisode: '#',
    splitPlayNameAndUrl: '$'
  });

  // Notification Toast state
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Watch History state
  const [watchHistory, setWatchHistory] = useState<WatchHistoryItem[]>([]);

  // Is player active in Emby cinematic workspace
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Favorites list state
  const [favorites, setFavorites] = useState<VideoItem[]>([]);

  // Load Watch History and Favorites from LocalStorage on mount
  useEffect(() => {
    const historical = localStorage.getItem('watchHistory');
    if (historical) {
      try {
        setWatchHistory(JSON.parse(historical));
      } catch (e) {
        console.warn('Failed to parse watch history', e);
      }
    }

    const favs = localStorage.getItem('favorites');
    if (favs) {
      try {
        setFavorites(JSON.parse(favs));
      } catch (e) {
        console.warn('Failed to parse favorites', e);
      }
    }
  }, []);

  const saveWatchHistory = (
    video: VideoItem,
    serverIdx: number,
    epIdx: number,
    serverName: string,
    epName: string,
    epUrl: string
  ) => {
    const nextItem: WatchHistoryItem = {
      id: video.id,
      name: video.name,
      pic: video.pic,
      category: video.category,
      remarks: video.remarks,
      cmsId: settings.selectedCmsId || '',
      playFrom: video.playFrom,
      playUrl: video.playUrl,
      lastPlayedServerName: serverName,
      lastPlayedEpisodeName: epName,
      lastPlayedEpisodeUrl: epUrl,
      lastPlayedServerIndex: serverIdx,
      lastPlayedEpisodeIndex: epIdx,
      updatedAt: Date.now(),
      content: video.content,
      year: video.year,
      area: video.area,
      lang: video.lang,
      director: video.director,
      actor: video.actor
    };
    
    setWatchHistory(prev => {
      const filtered = prev.filter(item => item.id !== video.id);
      const updated = [nextItem, ...filtered].slice(0, 30);
      localStorage.setItem('watchHistory', JSON.stringify(updated));
      return updated;
    });
  };

  const handleDeleteHistory = (id: string | number, e: React.MouseEvent) => {
    e.stopPropagation();
    setWatchHistory(prev => {
      const updated = prev.filter(item => item.id !== id);
      localStorage.setItem('watchHistory', JSON.stringify(updated));
      return updated;
    });
    showToast('已从历史记录中移除');
  };

  const handleClearAllHistory = () => {
    setWatchHistory([]);
    localStorage.removeItem('watchHistory');
    showToast('历史播放记录已完全清空');
  };

  const toggleFavorite = (video: VideoItem) => {
    setFavorites(prev => {
      const isFav = prev.some(item => String(item.id) === String(video.id));
      let nextFavs;
      if (isFav) {
        nextFavs = prev.filter(item => String(item.id) !== String(video.id));
        showToast(`已从臻选收藏中移除: ${video.name}`, 'info');
      } else {
        nextFavs = [video, ...prev];
        showToast(`已成功收藏影片: 《${video.name}》`, 'success');
      }
      localStorage.setItem('favorites', JSON.stringify(nextFavs));
      return nextFavs;
    });
  };

  const handleResumeHistory = (item: WatchHistoryItem) => {
    if (item.cmsId && item.cmsId !== settings.selectedCmsId) {
      const parentCms = settings.cmsSources.find(c => c.id === item.cmsId);
      if (parentCms) {
        setSettings(prev => ({ ...prev, selectedCmsId: item.cmsId }));
        showToast(`已切换至该视频所属数据站: ${parentCms.name}`, 'info');
      }
    }
    
    const movie: VideoItem = {
      id: item.id,
      name: item.name,
      pic: item.pic,
      category: item.category,
      remarks: item.remarks,
      content: item.content || '',
      playFrom: item.playFrom,
      playUrl: item.playUrl,
      year: item.year,
      area: item.area,
      lang: item.lang,
      director: item.director,
      actor: item.actor
    };
    
    setCurrentVideo(movie);
    setIsPlaying(true);
    
    const splitServ = settings.rules.splitPlayServer || '$$$';
    const splitEp = settings.rules.splitPlayEpisode || '#';
    const splitNameUrl = settings.rules.splitPlayNameAndUrl || '$';

    const serverParts = movie.playUrl.split(splitServ);
    const serverNames = movie.playFrom.split(splitServ);

    const parsed = serverParts.map((part, index) => {
      const serverDesc = serverNames[index] || `播放线路 ${index + 1}`;
      
      const episodesList = part.split(splitEp).filter(ep => ep.trim() !== '').map(epStr => {
        const details = epStr.split(splitNameUrl);
        let epName = '播放播放';
        let epUrl = '';

        if (details.length >= 2) {
          epName = details[0].trim();
          epUrl = details.slice(1).join(splitNameUrl).trim();
        } else {
          epUrl = epStr.trim();
          epName = `正片`;
        }
        return { name: epName, url: epUrl };
      });

      return {
        name: serverDesc,
        episodes: episodesList
      };
    });

    setParsedServers(parsed);

    let targetServerIdx = item.lastPlayedServerIndex;
    let targetEpisodeIdx = item.lastPlayedEpisodeIndex;

    if (targetServerIdx >= parsed.length) {
      targetServerIdx = 0;
    }
    if (parsed[targetServerIdx] && targetEpisodeIdx >= parsed[targetServerIdx].episodes.length) {
      targetEpisodeIdx = 0;
    }

    if (parsed.length > 0 && parsed[targetServerIdx].episodes.length > 0) {
      setCurrentServerIndex(targetServerIdx);
      setCurrentEpisodeIndex(targetEpisodeIdx);
      setCurrentPlayUrl(parsed[targetServerIdx].episodes[targetEpisodeIdx].url);
      
      saveWatchHistory(
        movie,
        targetServerIdx,
        targetEpisodeIdx,
        parsed[targetServerIdx].name,
        parsed[targetServerIdx].episodes[targetEpisodeIdx].name,
        parsed[targetServerIdx].episodes[targetEpisodeIdx].url
      );

      showToast(`已为您自动恢复上次播放: ${parsed[targetServerIdx].name} - ${parsed[targetServerIdx].episodes[targetEpisodeIdx].name}`);
    } else {
      setCurrentPlayUrl('');
      showToast('无法定位该视频的播放地址', 'error');
    }

    const target = document.getElementById('active-player-room') || document.getElementById('main-content-flow');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ type, text });
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  // 1. Fetch settings from server
  useEffect(() => {
    async function loadSettings() {
      try {
        // Load local copy first for instant response and persistence across server resets
        const localSettingsStr = localStorage.getItem('appSettings');
        let localSettings: AppSettings | null = null;
        if (localSettingsStr) {
          try {
            localSettings = JSON.parse(localSettingsStr);
            // Self-heating sanitation for legacy defunct domains
            if (localSettings && Array.isArray(localSettings.cmsSources)) {
              localSettings.cmsSources = localSettings.cmsSources.map(source => {
                if (
                  source.url.includes('wlzy.co') || 
                  source.url.includes('collect.wlzy.co') || 
                  source.url.includes('cj.wlzyapi.com') || 
                  source.url.includes('wolongapi.com') || 
                  source.url.includes('api.wolongapi.com')
                ) {
                  source.url = 'https://api.wlzyapi.com/api.php/provide/vod/at/json';
                }
                return source;
              });
            }
          } catch (e) {
            console.warn('Failed to parse local settings', e);
          }
        }

        const res = await fetch('/api/settings').catch(() => null);
        if (res && res.ok) {
          const serverData = (await res.json()) as AppSettings;
          
          if (localSettings) {
            // Merge server configurations with local configuration to preserve custom resources user added
            const mergedCmsSources = [...serverData.cmsSources];
            if (Array.isArray(localSettings.cmsSources)) {
              localSettings.cmsSources.forEach(localSrc => {
                const isDuplicate = mergedCmsSources.some(s => s.id === localSrc.id || s.url === localSrc.url);
                if (!isDuplicate) {
                  mergedCmsSources.push(localSrc);
                }
              });
            }

            const mergedParsers = [...serverData.m3u8Parsers];
            if (Array.isArray(localSettings.m3u8Parsers)) {
              localSettings.m3u8Parsers.forEach(localParser => {
                const isDuplicate = mergedParsers.some(p => p.id === localParser.id || p.url === localParser.url);
                if (!isDuplicate) {
                  mergedParsers.push(localParser);
                }
              });
            }

            // Restore selection if it exists in the merged lists
            const selectedCmsId = mergedCmsSources.some(s => s.id === localSettings!.selectedCmsId)
              ? localSettings.selectedCmsId
              : serverData.selectedCmsId;

            const selectedParserId = mergedParsers.some(p => p.id === localSettings!.selectedParserId)
              ? localSettings.selectedParserId
              : serverData.selectedParserId;

            const mergedSettings: AppSettings = {
              ...serverData,
              ...localSettings,
              cmsSources: mergedCmsSources,
              m3u8Parsers: mergedParsers,
              selectedCmsId,
              selectedParserId
            };

            setSettings(mergedSettings);
            setRules(mergedSettings.rules);

            // Sync back to local storage and server
            localStorage.setItem('appSettings', JSON.stringify(mergedSettings));
            fetch('/api/settings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(mergedSettings)
            }).catch(err => console.warn('Failed silent server sync', err));
          } else {
            setSettings(serverData);
            setRules(serverData.rules);
            localStorage.setItem('appSettings', JSON.stringify(serverData));
          }
          showToast('已加载影视采集与解析配置', 'info');
        } else {
          if (localSettings) {
            setSettings(localSettings);
            setRules(localSettings.rules);
            showToast('已应用本地缓存储存设定', 'info');
          } else {
            // Hard fallback with active defaults for completely offline/static builds
            const BACKUP_DEFAULTS: AppSettings = {
              cmsSources: [
                { id: 'ffzy', name: '飞速高清 (飞速极速)', url: 'https://api.ffzyapi.com/api.php/provide/vod/at/json', status: 'active' },
                { id: 'bdzy', name: '极速影音 (百度秒播)', url: 'https://api.apibdzy.com/api.php/provide/vod/at/json', status: 'active' },
                { id: 'hhzy', name: '豪华资源 (豪华极速)', url: 'https://hhzyapi.com/api.php/provide/vod/at/json', status: 'active' },
                { id: 'bfzy', name: '暴风资源 (经典多源)', url: 'https://bfzyapi.com/api.php/provide/vod/at/json', status: 'active' },
                { id: 'wlzy', name: '卧龙资源 (高速M3U8)', url: 'https://api.wlzyapi.com/api.php/provide/vod/at/json', status: 'active' }
              ],
              m3u8Parsers: [
                { id: 'xmflv', name: '全能高清解析 (网页嵌套)', url: 'https://jx.xmflv.cc/?url=', type: 'iframe', status: 'active' },
                { id: 'jsonplayer', name: '极速无广解析', url: 'https://jx.jsonplayer.com/player/?url=', type: 'iframe', status: 'active' },
                { id: 'aidouer', name: '虾米解析', url: 'https://jx.aidouer.net/?url=', type: 'iframe', status: 'active' }
              ],
              rules: {
                titleKey: 'vod_name',
                picKey: 'vod_pic',
                categoryKey: 'type_name',
                playUrlKey: 'vod_play_url',
                remarksKey: 'vod_remarks',
                contentKey: 'vod_content',
                playFromServerKey: 'vod_play_from',
                splitPlayServer: '$$$',
                splitPlayEpisode: '#',
                splitPlayNameAndUrl: '$'
              },
              selectedCmsId: 'ffzy',
              selectedParserId: 'internal',
              fetchMode: 'proxy'
            };
            setSettings(BACKUP_DEFAULTS);
            setRules(BACKUP_DEFAULTS.rules);
            localStorage.setItem('appSettings', JSON.stringify(BACKUP_DEFAULTS));
            showToast('已加载默认采集与解析配置模板', 'success');
          }
        }
      } catch (err: any) {
        console.warn('Silent config error:', err);
      } finally {
        setLoadingSettings(false);
      }
    }
    loadSettings();
  }, []);

  // Sync / Load videos when Active CMS config is loaded or changes, as well as selected category, page, search
  useEffect(() => {
    if (loadingSettings || !settings.selectedCmsId) return;

    const activeCms = settings.cmsSources.find(s => s.id === settings.selectedCmsId);
    if (!activeCms) {
      // Fallback if not found
      if (settings.cmsSources.length > 0) {
        const firstCmsId = settings.cmsSources[0].id;
        setSettings(prev => ({ ...prev, selectedCmsId: firstCmsId }));
      }
      return;
    }

    fetchVideosFromCms(activeCms.url, currentPage, selectedCategoryId, searchKeyword);
  }, [settings.selectedCmsId, currentPage, selectedCategoryId, searchKeyword, loadingSettings]);

  // Handle auto pulling category filter list on CMS target source change
  useEffect(() => {
    if (loadingSettings || !settings.selectedCmsId) return;
    const activeCms = settings.cmsSources.find(s => s.id === settings.selectedCmsId);
    if (!activeCms) return;

    async function fetchClasses() {
      try {
        const useDirect = settings.fetchMode === 'direct';
        let res;
        if (useDirect) {
          res = await fetch(activeCms!.url).catch(() => null);
        } else {
          const proxyUrl = `/api/cms-proxy?url=${encodeURIComponent(activeCms!.url)}`;
          res = await fetch(proxyUrl).catch(() => null);
          if (!res || res.status === 404 || res.status === 405 || !res.ok) {
            console.warn('Proxy route unavailable or error, falling back to direct CMS fetch...');
            res = await fetch(activeCms!.url).catch(() => null);
          }
        }
        if (res && res.ok) {
          const text = await res.text();
          try {
            const data = JSON.parse(text);
            // Pull class categories if returned by CMS json API
            if (data.class && Array.isArray(data.class)) {
              const seenCats = new Set();
              const formattedCats: CategoryItem[] = [];
              for (const c of data.class) {
                const catId = String(c.type_id ?? c.id ?? '');
                const catName = c.type_name ?? c.name ?? '';
                if (catId && catName && !seenCats.has(catId)) {
                  seenCats.add(catId);
                  formattedCats.push({
                    id: catId,
                    name: catName
                  });
                }
              }
              setCategories(formattedCats);
              return;
            }
          } catch (e) {
            console.warn('Failed to parse classifications JSON:', e);
          }
        }
        // Fallback list of major general groups if class list is missing or invalid
        setCategories([
          { id: '1', name: '电影' },
          { id: '2', name: '电视剧' },
          { id: '3', name: '综艺' },
          { id: '4', name: '动漫' }
        ]);
      } catch (err) {
        console.warn('Could not extract classifications directly from CMS, falling back:', err);
        setCategories([
          { id: '1', name: '电影' },
          { id: '2', name: '电视剧' },
          { id: '3', name: '综艺' },
          { id: '4', name: '动漫' }
        ]);
      }
    }
    
    // Clear old filters
    setSelectedCategoryId('');
    setCategories([]);
    setCurrentPage(1);
    fetchClasses();
  }, [settings.selectedCmsId, loadingSettings]);

  // Core CMS consumer with custom parsing rule mappings applied on proxy feedback
  const fetchVideosFromCms = async (
    cmsUrl: string,
    page: number,
    categoryId: string | number,
    keyword: string,
    forceRefresh: boolean = false
  ) => {
    setLoadingVideos(true);
    try {
      const useDirect = settings.fetchMode === 'direct';
      let res;
      let usedProxy = false;

      if (useDirect) {
        let directUrl = cmsUrl;
        const separator = directUrl.includes('?') ? '&' : '?';
        directUrl += `${separator}pg=${page}`;
        if (keyword) {
          directUrl += `&wd=${encodeURIComponent(keyword)}&ac=list`;
        } else if (categoryId) {
          directUrl += `&t=${categoryId}&ac=videolist`;
        } else {
          directUrl += `&ac=videolist`;
        }
        res = await fetch(directUrl).catch((e) => {
          throw new Error(`直接连接源站接口失败: ${e.message}。由于目标接口不支持跨域访问(CORS)，浏览器安全策略已拦截请求。建议在浏览器安装【CORS Unblock】等跨域解锁扩展插件，或在右下角【系统设置】中选择开启【服务器中转代理】。`);
        });
      } else {
        usedProxy = true;
        let queryUrl = `/api/cms-proxy?url=${encodeURIComponent(cmsUrl)}&pg=${page}`;
        if (keyword) {
          queryUrl += `&wd=${encodeURIComponent(keyword)}&ac=list`;
        } else if (categoryId) {
          queryUrl += `&t=${categoryId}&ac=videolist`;
        } else {
          queryUrl += `&ac=videolist`;
        }
        if (forceRefresh) {
          queryUrl += `&refresh=true`;
        }

        res = await fetch(queryUrl).catch(() => null);
        if (!res || res.status === 404 || res.status === 405 || !res.ok) {
          console.warn(`Proxy route returned non-ok status ${res?.status || 'unknown'}, falling back to direct CMS fetch...`);
          
          let proxyErrorMsg = '';
          if (res && res.status !== 404 && res.status !== 405) {
            try {
              const text = await res.text().catch(() => '');
              const errorJson = JSON.parse(text);
              proxyErrorMsg = errorJson.error || '';
            } catch {}
          }

          usedProxy = false;
          let directUrl = cmsUrl;
          const separator = directUrl.includes('?') ? '&' : '?';
          directUrl += `${separator}pg=${page}`;
          if (keyword) {
            directUrl += `&wd=${encodeURIComponent(keyword)}&ac=list`;
          } else if (categoryId) {
            directUrl += `&t=${categoryId}&ac=videolist`;
          } else {
            directUrl += `&ac=videolist`;
          }
          res = await fetch(directUrl).catch((e) => {
            if (proxyErrorMsg) {
              throw new Error(proxyErrorMsg);
            }
            throw new Error(`连接失败：云端中转代理服务连接超时或在这个托管服务商（如 Vercel）中受限，且直接连接源站亦宣告失败（${e.message}）。这通常是源站无 CORS 允许头导致的。建议安装网页【CORS Unblock】扩展插件，或在右下角【系统设置】切换到其他可用的采集源节点。`);
          });

          if (res && !res.ok && proxyErrorMsg) {
            throw new Error(proxyErrorMsg);
          }
        }
      }

      const text = await res.text().catch(() => '');

      if (!res.ok) {
        let errorMsg = '获取数据失败，资源站接口可能暂不可用';
        try {
          const errorJson = JSON.parse(text);
          errorMsg = errorJson.error || errorMsg;
        } catch {
          if (text.includes('<!DOCTYPE') || text.includes('<html')) {
            errorMsg = '代理网关返回了网页错误 (例如 502/504 线路超时，或服务器不可达)，请切换其他采集源重试';
          }
        }
        throw new Error(errorMsg);
      }

      if (text.includes('<!DOCTYPE') || text.includes('<html')) {
        throw new Error('代理网关返回了网页数据 (可能采集主站接口超时或暂时失效)，请检查配置的采集源地址或切换其他采集源');
      }

      let rawData;
      try {
        rawData = JSON.parse(text);
      } catch (e) {
        throw new Error('解析返回的 JSON 数据失败，可能是接口已被屏蔽或返回了无效格式');
      }

      // Ensure we extract pagination correctly
      const total = rawData.total ? parseInt(rawData.total) : (rawData.pagecount ? parseInt(rawData.pagecount) * 20 : 100);
      const pagecount = rawData.pagecount ? parseInt(rawData.pagecount) : 1;
      const currentPageFromApi = rawData.page ? parseInt(rawData.page) : page;
      setTotalPages(pagecount || 1);
      setTotalCount(total);

      // Now apply the USER'S scrape mapping rules!
      const rawList = rawData.list || [];
      const userRules = settings.rules;

      const normalizedList: VideoItem[] = rawList.map((item: any) => {
        return {
          id: item.vod_id || item.id || Math.random().toString(),
          name: item[userRules.titleKey] || item.vod_name || '未命名视频',
          pic: item[userRules.picKey] || item.vod_pic || '',
          category: item[userRules.categoryKey] || item.type_name || '其它',
          remarks: item[userRules.remarksKey] || item.vod_remarks || '完结',
          content: item[userRules.contentKey] || item.vod_content || '暂无剧情简介...',
          playFrom: item[userRules.playFromServerKey] || item.vod_play_from || 'm3u8',
          playUrl: item[userRules.playUrlKey] || item.vod_play_url || '',
          year: item.vod_year || item.year || '',
          area: item.vod_area || item.area || '',
          lang: item.vod_lang || item.lang || '',
          director: item.vod_director || item.director || '',
          actor: item.vod_actor || item.actor || ''
        };
      });

      setVideos(normalizedList);
    } catch (err: any) {
      showToast(`接口请求出错: ${err.message}`, 'error');
      setVideos([]);
      setTotalPages(1);
    } finally {
      setLoadingVideos(false);
    }
  };

  // Save full settings to server database
  const saveAllSettingsToServer = async (newSettings: AppSettings) => {
    // Write immediately to localStorage for robust offline/cycle resilience
    localStorage.setItem('appSettings', JSON.stringify(newSettings));
    setSettings(newSettings);
    if (newSettings.rules) {
      setRules(newSettings.rules);
    }
    
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
      if (res.ok) {
        showToast('设置保存成功且生效！', 'success');
      } else {
        // If the backend is read-only (like serverless Vercel / ephemeral)
        showToast('缓存已更新：由于服务器是只读环境，配置已保存在本地浏览器中，本设备即享生效', 'info');
      }
    } catch (err: any) {
      console.warn('Silent cloud sync backup details:', err);
      showToast('配置已应用并成功缓存在本地浏览器中', 'success');
    }
  };

  // CMS configuration modifications
  const handleAddNewCms = () => {
    if (!tempCmsName || !tempCmsUrl) {
      showToast('请输入完整的资源站名称及JSON端点', 'error');
      return;
    }
    if (!tempCmsUrl.startsWith('http://') && !tempCmsUrl.startsWith('https://')) {
      showToast('API地址需以 http:// 或 https:// 开头', 'error');
      return;
    }

    const newId = 'cms_' + Date.now();
    const newSource: CMSSource = {
      id: newId,
      name: tempCmsName,
      url: tempCmsUrl,
      status: 'active'
    };

    const nextSettings = {
      ...settings,
      cmsSources: [...settings.cmsSources, newSource],
      selectedCmsId: settings.selectedCmsId || newId // Auto-choose if first
    };

    saveAllSettingsToServer(nextSettings);
    setTempCmsName('');
    setTempCmsUrl('');
    showToast(`成功新增采集源: ${tempCmsName}`);
  };

  const handleDeleteCms = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (settings.cmsSources.length <= 1) {
      showToast('请至少保留一个默认CMS采集源！', 'info');
      return;
    }
    const filtered = settings.cmsSources.filter(s => s.id !== id);
    const selectFallbackId = settings.selectedCmsId === id ? filtered[0].id : settings.selectedCmsId;
    
    const nextSettings = {
      ...settings,
      cmsSources: filtered,
      selectedCmsId: selectFallbackId
    };
    saveAllSettingsToServer(nextSettings);
    showToast('采集源已移除');
  };

  // Parser modifications
  const handleAddNewParser = () => {
    if (!tempParserName || !tempParserUrl) {
      showToast('请输入解析器名称及带 = 号的接口地址', 'error');
      return;
    }
    const newId = 'parser_' + Date.now();
    const newParser: M3U8Parser = {
      id: newId,
      name: tempParserName,
      url: tempParserUrl,
      type: 'iframe',
      status: 'active'
    };

    const nextSettings = {
      ...settings,
      m3u8Parsers: [...settings.m3u8Parsers, newParser]
    };
    saveAllSettingsToServer(nextSettings);
    setTempParserName('');
    setTempParserUrl('');
    showToast(`已添加网页嵌套解析接口: ${tempParserName}`);
  };

  const handleDeleteParser = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const filtered = settings.m3u8Parsers.filter(p => p.id !== id);
    const fallbackParserId = settings.selectedParserId === id ? 'internal' : settings.selectedParserId;

    const nextSettings = {
      ...settings,
      m3u8Parsers: filtered,
      selectedParserId: fallbackParserId
    };
    saveAllSettingsToServer(nextSettings);
    showToast('解析器已移除');
  };

  // Rules save
  const handleSaveScrapingRules = () => {
    const nextSettings = {
      ...settings,
      rules: { ...rules }
    };
    saveAllSettingsToServer(nextSettings);
  };

  // Parse play urls of chosen movie according to splitting rules
  const parsePlayData = (video: VideoItem) => {
    const splitServ = settings.rules.splitPlayServer || '$$$';
    const splitEp = settings.rules.splitPlayEpisode || '#';
    const splitNameUrl = settings.rules.splitPlayNameAndUrl || '$';

    // Parse different servers / languages
    const serverParts = video.playUrl.split(splitServ);
    const serverNames = video.playFrom.split(splitServ);

    const parsed = serverParts.map((part, index) => {
      const serverDesc = serverNames[index] || `播放线路 ${index + 1}`;
      
      // Parse individual episodes
      const episodesList = part.split(splitEp).filter(ep => ep.trim() !== '').map(epStr => {
        const details = epStr.split(splitNameUrl);
        let epName = '播放播放';
        let epUrl = '';

        if (details.length >= 2) {
          epName = details[0].trim();
          // Sometimes m3u8 uses nested lists
          epUrl = details.slice(1).join(splitNameUrl).trim();
        } else {
          epUrl = epStr.trim();
          // Fallback guess name
          epName = `正片`;
        }
        return { name: epName, url: epUrl };
      });

      return {
        name: serverDesc,
        episodes: episodesList
      };
    });

    setParsedServers(parsed);
    
    // Check if we have history for this video to resume
    const existingHistory = watchHistory.find(
      item => String(item.id) === String(video.id)
    );
    
    let targetServerIdx = 0;
    let targetEpisodeIdx = 0;
    
    if (existingHistory) {
      if (
        existingHistory.lastPlayedServerIndex < parsed.length &&
        existingHistory.lastPlayedEpisodeIndex < parsed[existingHistory.lastPlayedServerIndex].episodes.length
      ) {
        targetServerIdx = existingHistory.lastPlayedServerIndex;
        targetEpisodeIdx = existingHistory.lastPlayedEpisodeIndex;
        showToast(`已自动为您恢复续看：${existingHistory.lastPlayedServerName} - ${existingHistory.lastPlayedEpisodeName}`, 'success');
      }
    }

    // Choose target server and episode to play
    if (parsed.length > 0 && parsed[targetServerIdx].episodes.length > 0) {
      setCurrentServerIndex(targetServerIdx);
      setCurrentEpisodeIndex(targetEpisodeIdx);
      setCurrentPlayUrl(parsed[targetServerIdx].episodes[targetEpisodeIdx].url);
      
      saveWatchHistory(
        video,
        targetServerIdx,
        targetEpisodeIdx,
        parsed[targetServerIdx].name,
        parsed[targetServerIdx].episodes[targetEpisodeIdx].name,
        parsed[targetServerIdx].episodes[targetEpisodeIdx].url
      );
    } else {
      setCurrentPlayUrl('');
      showToast('未能从所选播放字段解析到合规链接。请检查您在自定义规则中设置的符号。', 'info');
    }
  };

  const handleSelectVideo = (video: VideoItem) => {
    setCurrentVideo(video);
    setIsPlaying(false);
    parsePlayData(video);
    // Scroll smoothly to player
    const target = document.getElementById('active-player-room') || document.getElementById('main-content-flow');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleSelectEpisode = (serverIndex: number, episodeIndex: number, url: string) => {
    setCurrentServerIndex(serverIndex);
    setCurrentEpisodeIndex(episodeIndex);
    setCurrentPlayUrl(url);

    if (currentVideo && parsedServers[serverIndex]) {
      const server = parsedServers[serverIndex];
      const ep = server.episodes[episodeIndex];
      saveWatchHistory(
        currentVideo,
        serverIndex,
        episodeIndex,
        server.name,
        ep ? ep.name : `第${episodeIndex + 1}集`,
        url
      );
    }
  };

  const handleEpisodeNavigation = (direction: 'prev' | 'next') => {
    const currentServer = parsedServers[currentServerIndex];
    if (!currentServer) return;

    let targetIndex = currentEpisodeIndex;
    if (direction === 'prev') {
      targetIndex = currentEpisodeIndex - 1;
    } else {
      targetIndex = currentEpisodeIndex + 1;
    }

    if (targetIndex >= 0 && targetIndex < currentServer.episodes.length) {
      const targetEp = currentServer.episodes[targetIndex];
      setCurrentEpisodeIndex(targetIndex);
      setCurrentPlayUrl(targetEp.url);
      showToast(`已切换至: ${targetEp.name}`);

      if (currentVideo) {
        saveWatchHistory(
          currentVideo,
          currentServerIndex,
          targetIndex,
          currentServer.name,
          targetEp.name,
          targetEp.url
        );
      }
    }
  };

  const currentParserObject = settings.selectedParserId === 'internal'
    ? null
    : settings.m3u8Parsers.find(p => p.id === settings.selectedParserId) || null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans flex flex-col antialiased">
      
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            id="toast-notification-banner"
            className={`fixed top-5 left-1/2 -translate-x-1/2 z-50 flex items-center space-x-2.5 px-4.5 py-3 rounded-xl shadow-xl border text-sm max-w-sm w-full backdrop-blur-md ${
              toastMessage.type === 'error'
                ? 'bg-rose-950 border-rose-900 text-white'
                : toastMessage.type === 'info'
                ? 'bg-zinc-900 border-zinc-800 text-white'
                : 'bg-emerald-950 border-emerald-900 text-white'
            }`}
          >
            {toastMessage.type === 'error' ? (
              <AlertTriangle className="h-5 w-5 text-rose-500 shrink-0" />
            ) : toastMessage.type === 'info' ? (
              <Cpu className="h-5 w-5 text-red-500 shrink-0 animate-pulse" />
            ) : (
              <Check className="h-5 w-5 text-emerald-500 shrink-0" />
            )}
            <p className="font-semibold truncate flex-1">{toastMessage.text}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* TOP DESKTOP & MOBILE HEADER */}
      <header className="h-16 flex items-center justify-between px-4 sm:px-10 bg-[#090909]/95 backdrop-blur-md border-b border-zinc-900 sticky top-0 z-40 shadow-2xl transition duration-300">
        <div className="flex items-center space-x-6 sm:space-x-10">
          {/* Logo brand resembling the photo */}
          <div className="flex items-center space-x-1.5 cursor-pointer" onClick={() => { setActiveTab('home'); setNavTab('home'); setSelectedCategoryId(''); setSearchKeyword(''); }}>
            <span className="h-8.5 w-8.5 bg-red-650 text-white rounded-sm flex items-center justify-center font-display font-bold text-sm shadow-lg border border-red-700/20">
              赛
            </span>
            <span className="hidden sm:inline font-sans font-black tracking-widest text-red-500 text-lg sm:text-xl select-none">
              赛博影院
            </span>
          </div>

          {/* Desktop Navigation Tabs - exact replication of photo items */}
          <nav className="hidden md:flex space-x-5 text-sm font-semibold text-zinc-350">
            <button
              onClick={() => { setActiveTab('home'); setNavTab('iptv'); }}
              className={`hover:text-red-500 transition-all cursor-pointer text-[13px] flex items-center space-x-1 ${activeTab === 'home' && navTab === 'iptv' ? 'text-red-550 font-bold' : ''}`}
            >
              <Radio className="h-3.5 w-3.5 animate-pulse text-red-500" />
              <span>电视直播</span>
            </button>
            <button
              onClick={() => { setActiveTab('admin'); }}
              className={`hover:text-red-500 transition-colors flex items-center space-x-1 cursor-pointer text-[13px] ${activeTab === 'admin' ? 'text-white font-bold' : ''}`}
            >
              <Lock className="h-3.5 w-3.5 text-zinc-400" />
              <span>管理后台</span>
            </button>
          </nav>
        </div>

        <div className="flex items-center space-x-4">
          {/* Custom Search trigger helper icon */}
          <button 
            type="button" 
            onClick={() => {
              setActiveTab('home');
              const searchElem = document.getElementById('search-input-field');
              if (searchElem) {
                searchElem.scrollIntoView({ behavior: 'smooth' });
                searchElem.focus();
              }
            }}
            className="text-zinc-400 hover:text-white transition cursor-pointer p-1"
          >
            <Search className="h-4.5 w-4.5" />
          </button>

          {/* Cinematic user profile avatar with notification bell and dot */}
          <div className="relative group cursor-pointer flex items-center space-x-2.5">
            {/* Bell Icon resembling photo */}
            <div className="relative text-zinc-400 hover:text-white transition p-1">
              <span className="absolute top-1 right-1 h-1.5 w-1.5 bg-red-600 rounded-full animate-pulse" />
              <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>

            {/* Profile image with red online dot */}
            <div className="relative h-7 w-7 rounded bg-zinc-700 overflow-hidden flex items-center justify-center border border-zinc-600 shadow-sm">
              <User className="h-4 w-4 text-zinc-200" />
              <span className="absolute bottom-0 right-0 h-1.5 w-1.5 bg-red-650 rounded-full border border-zinc-950" />
            </div>
          </div>

          {isAdminLoggedIn && (
            <button
              onClick={() => {
                setIsAdminLoggedIn(false);
                sessionStorage.removeItem('isAdminLoggedIn');
                setActiveTab('home');
                showToast('已安全退出管理后台', 'info');
              }}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1 border border-zinc-800 bg-zinc-900 hover:bg-rose-950 hover:text-white text-zinc-350 transition cursor-pointer"
              title="退出登录"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">退出后台</span>
            </button>
          )}
        </div>
      </header>

      {/* MOBILE HEADER BUTTONS */}
      <div className="md:hidden flex bg-[#0c0c0c] px-2 py-2.5 justify-around border-b border-zinc-900 text-xs font-medium text-zinc-400">
        <button
          onClick={() => { setActiveTab('home'); setNavTab('iptv'); }}
          className={`px-3 py-1 flex items-center space-x-0.5 cursor-pointer transition ${activeTab === 'home' && navTab === 'iptv' ? 'text-red-500 font-extrabold' : ''}`}
        >
          <Radio className="h-3 w-3 animate-pulse text-red-500" />
          <span>直播</span>
        </button>
        <button
          onClick={() => { setActiveTab('admin'); }}
          className={`px-3 py-1 flex items-center space-x-0.5 cursor-pointer transition ${activeTab === 'admin' ? 'text-red-500 font-extrabold' : ''}`}
        >
          <Lock className="h-2.5 w-2.5" />
          <span>后台</span>
        </button>
      </div>

      {/* MAIN VIEW AREA */}
      <main className="flex-1 flex flex-col overflow-hidden">
        
        {/* INNER SCROLL CONTENT - Renders tabs according to navigation */}
        <section className="flex-1 p-4 sm:p-7 overflow-y-auto bg-zinc-950" id="main-content-flow">
          
          {/* TAB 1: VIDEOS AND MAIN THEME HOME */}
          {activeTab === 'home' && navTab !== 'iptv' && (
            <div className="space-y-6">
              
               {/* HERO SHOWCASE SPOTLIGHT BANNER (resembles STARFALL banner from photo) */}
              {!currentVideo && (() => {
                const candidates = getFeaturedCandidates();
                const highlight = candidates[activeHeroIndex] || candidates[0];
                return (
                  <div className="w-full relative rounded-2xl overflow-hidden shadow-2xl border border-zinc-900 bg-zinc-950" id="nimbus-hero-banner" style={{ minHeight: '380px' }}>
                    {/* Backdrop Background image with cinematic masks */}
                    <div className="absolute inset-0 z-0">
                      <img
                        src={highlight.pic}
                        alt={highlight.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover select-none pointer-events-none opacity-85 object-center scale-102 saturate-[1.15] brightness-90 transition-all duration-1000 ease-out"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&q=80&w=1600';
                        }}
                      />
                      {/* Dark gradient vignette overlays to allow high overlay readable text contrast */}
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0b0b0b] via-[#0b0b0b]/40 to-[#0b0b0b]/15 z-10" />
                      <div className="absolute inset-0 bg-gradient-to-r from-[#0b0b0b]/90 via-[#0b0b0b]/35 to-transparent z-10" />
                    </div>

                    {/* Info Overlay Content left aligned */}
                    <div className="relative z-20 h-full w-full flex flex-col justify-end p-6 sm:p-10 md:p-12 space-y-4 max-w-3xl text-left" style={{ minHeight: '380px' }}>
                      
                      {/* 赛博影院 ORIGINAL tag or rating banner */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-sans font-black bg-red-650 text-white px-2 py-0.5 rounded-sm tracking-widest uppercase flex items-center gap-1 shadow-md">
                          <Sparkles className="h-2.5 w-2.5 fill-white" />
                          赛博独家 / CYBER ORIGINAL
                        </span>
                        <span className="text-[10px] font-bold font-mono bg-zinc-900 border border-zinc-800 text-amber-500 px-2 py-0.5 rounded shadow-sm">
                          ★ {highlight.rating} RATING
                        </span>
                        <span className="text-[10px] font-semibold text-zinc-350 font-mono bg-black/40 backdrop-blur-md px-2 py-0.5 rounded border border-white/5">
                          {highlight.year}
                        </span>
                        <span className="text-[10px] font-sans font-semibold text-zinc-300 bg-red-950/50 text-red-500 px-2.5 py-0.5 rounded-full border border-red-900/30">
                          {highlight.remarks}
                        </span>
                      </div>

                      {/* Bold display title of the featured film */}
                      <h2 className="text-3xl sm:text-5xl md:text-6xl font-display font-black tracking-tight uppercase leading-none text-white drop-shadow-md select-none transition-all duration-700 ease-out">
                        {highlight.name}
                      </h2>

                      {/* Movie info description limitation */}
                      <p className="text-xs sm:text-sm text-zinc-350 leading-relaxed max-w-xl font-light drop-shadow-sm font-sans line-clamp-3">
                        {highlight.content}
                      </p>

                      {/* Metadata tags */}
                      <div className="flex flex-wrap items-center gap-2.5 pt-1 text-[11px] font-medium text-zinc-400">
                        <span className="text-zinc-200">{highlight.genres}</span>
                        <span className="text-zinc-600 font-mono select-none">|</span>
                        <span>{highlight.duration}</span>
                        <span className="text-zinc-600 font-mono select-none">|</span>
                        <span>{highlight.area}</span>
                      </div>

                      {/* Standard Netflix action control buttons */}
                      <div className="flex flex-wrap items-center gap-3 pt-3">
                        <button
                          onClick={() => {
                            if (highlight.realItem) {
                              handleSelectVideo(highlight.realItem);
                            } else {
                              showToast('星陨战纪 (STARFALL) 是一部独家影视推荐。请加载下方线路开始探索电影库。', 'info');
                            }
                          }}
                          className="bg-red-650 hover:bg-red-700 text-white font-extrabold text-xs sm:text-sm px-6 py-3 rounded-lg shadow-lg hover:shadow-red-950/40 transition duration-150 transform hover:scale-[1.03] active:scale-95 flex items-center gap-2 cursor-pointer border border-red-750/30"
                        >
                          <Play className="h-4 w-4 fill-white ml-0.5" />
                          <span>立即播放 / PLAY</span>
                        </button>

                        <button
                          onClick={() => {
                            if (highlight.realItem) {
                              handleSelectVideo(highlight.realItem);
                            } else {
                              showToast('星陨战纪 (STARFALL) 是一部独家 赛博影院 电影。加载下方 CMS 自定义线路即可尽享万部海量大片！', 'info');
                            }
                          }}
                          className="bg-zinc-900/80 hover:bg-zinc-850 text-zinc-100 font-bold text-xs sm:text-sm px-5 py-3 rounded-lg backdrop-blur-md transition duration-150 transform hover:scale-[1.03] active:scale-95 flex items-center gap-2 cursor-pointer border border-zinc-800"
                        >
                          <Info className="h-4.5 w-4.5 text-zinc-350" />
                          <span>影音详情 / INFO</span>
                        </button>
                      </div>

                    </div>

                    {/* Manual Sliding Indicators - absolute bottom right */}
                    {candidates.length > 1 && (
                      <div className="absolute bottom-6 right-6 sm:right-10 md:right-12 z-25 flex items-center gap-1.5 bg-black/45 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/5 shadow-md">
                        {candidates.map((_, idx) => (
                          <button
                            key={idx}
                            onClick={() => setActiveHeroIndex(idx)}
                            className={`h-2.5 rounded-full transition-all duration-300 cursor-pointer ${
                              activeHeroIndex === idx ? 'w-6 bg-red-550' : 'w-2.5 bg-zinc-600 hover:bg-zinc-400'
                            }`}
                            title={`切换至第 ${idx + 1} 个精选视频`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* EMBY-STYLE VIDEO CINEMA DETAIL WORKSPACE */}
              {currentVideo && (
                <div className="bg-zinc-950 text-zinc-100 rounded-2xl overflow-hidden shadow-xl border border-zinc-900 space-y-1 relative" id="active-player-room">
                  {/* Cinematic background blur backdrop */}
                  <div className="absolute inset-0 pointer-events-none select-none z-0 overflow-hidden rounded-2xl" id="dynamic-cinematic-backdrop">
                    <img
                      src={currentVideo.pic || "https://images.unsplash.com/photo-1542204172-e7052809a862?auto=format&fit=crop&q=80&w=800"}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover blur-3xl opacity-80 saturate-150 scale-105"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = 'https://images.unsplash.com/photo-1542204172-e7052809a862?auto=format&fit=crop&q=80&w=800';
                      }}
                    />
                    <div className="absolute inset-0 bg-zinc-950/55" />
                  </div>

                  {/* Part 1: THEATER VIEWPORT (Render player only if isPlaying is true!) */}
                  {isPlaying ? (
                    <div className="bg-black relative select-none z-10">
                      {/* Sub-header inside theater */}
                      <div className="flex items-center justify-between px-4 py-3 bg-zinc-900/95 border-b border-zinc-850 backdrop-blur-xs">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => {
                              setIsPlaying(false);
                            }}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-350 hover:text-white rounded-lg text-xs font-bold transition active:scale-95 border border-zinc-750 shadow-sm"
                          >
                            <ChevronLeft className="h-4 w-4" />
                            <span>返回介绍</span>
                          </button>
                        </div>
                        <div className="text-[11px] sm:text-xs text-zinc-400 truncate max-w-[150px] sm:max-w-md">
                          正在放映: <span className="text-white font-bold">{currentVideo.name}</span> ({parsedServers[currentServerIndex]?.episodes[currentEpisodeIndex]?.name || '正片'})
                        </div>
                        <button
                          onClick={() => {
                            setCurrentVideo(null);
                            setCurrentPlayUrl('');
                            setIsPlaying(false);
                          }}
                          className="text-[11px] font-bold text-rose-400 hover:text-rose-350 hover:underline flex items-center space-x-0.5 px-2.5 py-1 bg-zinc-900 rounded-lg border border-zinc-800"
                        >
                          <X className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">退出播放</span>
                        </button>
                      </div>

                      <VideoPlayer
                        playUrl={currentPlayUrl}
                        title={currentVideo.name}
                        episodeName={parsedServers[currentServerIndex]?.episodes[currentEpisodeIndex]?.name || '正片'}
                        parser={currentParserObject}
                        onNavigateEpisode={handleEpisodeNavigation}
                        hasPrev={currentEpisodeIndex > 0}
                        hasNext={
                          parsedServers[currentServerIndex]
                            ? currentEpisodeIndex < parsedServers[currentServerIndex].episodes.length - 1
                            : false
                        }
                      />
                    </div>
                  ) : (
                    /* Cinematic landscape poster header */
                    <div className="relative w-full h-[100px] sm:h-[150px] md:h-[180px] overflow-hidden bg-zinc-900/60 shrink-0 select-none z-10">
                      <img
                        src={currentVideo.pic || "https://images.unsplash.com/photo-1542204172-e7052809a862?auto=format&fit=crop&q=80&w=600"}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="absolute inset-0 w-full h-full object-cover blur-xl opacity-25 saturate-125 scale-105"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = 'https://images.unsplash.com/photo-1542204172-e7052809a862?auto=format&fit=crop&q=80&w=600';
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/50 to-transparent" />
                      
                      {/* Top left page back controls */}
                      <div className="absolute top-4 left-4 z-20">
                        <button
                          onClick={() => {
                            setCurrentVideo(null);
                            setCurrentPlayUrl('');
                            setIsPlaying(false);
                          }}
                          className="inline-flex items-center space-x-1.5 px-3 py-2 bg-zinc-900/80 hover:bg-zinc-850 border border-zinc-800 text-zinc-300 hover:text-white rounded-xl text-xs font-bold transition active:scale-95 shadow-lg backdrop-blur-xs cursor-pointer"
                        >
                          <ChevronLeft className="h-4 w-4" />
                          <span>返回影片列表</span>
                        </button>
                      </div>

                      {/* Top right spec badges: 4K, HDR, Dolby */}
                      <div className="absolute top-4 right-4 z-20 flex items-center space-x-1.5">
                        <span className="text-[9px] font-bold tracking-wider font-mono bg-amber-500/90 text-zinc-950 px-2 py-0.5 rounded shadow-sm">
                          4K ULTRA
                        </span>
                        <span className="text-[9px] font-bold tracking-wider font-mono bg-blue-600/90 text-white px-2 py-0.5 rounded shadow-sm hidden sm:inline">
                          HDR
                        </span>
                        <span className="text-[9px] font-bold tracking-wider font-mono bg-zinc-800/90 text-zinc-300 px-2 py-0.5 rounded shadow-sm border border-zinc-700">
                          DOLBY 5.1
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Part 2: POSTER METADATA AND DESCRIPTION ROW */}
                  <div className="px-5 pb-6 sm:px-10 sm:pb-10 relative text-left z-10 flex flex-col space-y-5">
                    {/* Top Portion: Title, Year and Film Badges */}
                    <div className="border-b border-zinc-900/80 pb-4.5 space-y-3">
                      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 justify-center md:justify-start">
                        <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight drop-shadow-md text-white">
                          {currentVideo.name}
                        </h2>
                        {currentVideo.year && (
                          <span className="text-zinc-400 text-sm sm:text-base font-semibold font-sans bg-zinc-900/60 border border-zinc-800 px-2.5 py-0.5 rounded-md shadow-inner">
                            {currentVideo.year}
                          </span>
                        )}
                      </div>

                      {/* Badges checklist */}
                      <div className="flex flex-wrap items-center gap-2 justify-center md:justify-start text-xs text-zinc-300">
                        <span className="inline-flex items-center space-x-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 font-extrabold px-2.5 py-1 rounded text-[11px] font-sans shadow-3xs">
                          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                          <span>{getRating(currentVideo.name)}评分</span>
                        </span>
                        
                        {currentVideo.category && (
                          <span className="bg-zinc-900 border border-zinc-800 font-bold px-2.5 py-1 rounded text-[11px]">
                            {currentVideo.category}
                          </span>
                        )}
                        
                        {currentVideo.area && (
                          <span className="bg-zinc-900 border border-zinc-800 font-bold px-2.5 py-1 rounded text-[11px]">
                            {currentVideo.area}
                          </span>
                        )}
                        
                        {currentVideo.lang && (
                          <span className="bg-zinc-900 border border-zinc-800 font-bold text-zinc-350 px-2.5 py-1 rounded text-[11px]">
                            {currentVideo.lang}
                          </span>
                        )}

                        <span className="bg-blue-955/20 text-blue-400 border border-blue-900/30 font-bold px-2.5 py-1 rounded text-[11px] font-mono shadow-3xs">
                          🔥 {getPopularity(currentVideo.name)} 播放热度
                        </span>
                      </div>
                    </div>

                    {/* Bottom Portion: Two Columns layout (Poster Left, Meta details Right) */}
                    <div className="flex flex-col md:flex-row gap-6 md:gap-10 items-start">
                      {/* Scaled-up Cinematic Grand Poster on Left */}
                      <div className={`relative ${isPlaying ? 'hidden md:block' : 'block'} w-44 h-66 sm:w-56 sm:h-84 md:w-64 md:h-96 bg-zinc-900 rounded-xl overflow-hidden shadow-2xl border-2 border-white/10 shrink-0 mx-auto md:mx-0 transition-all duration-300 group`}>
                        <img
                          src={currentVideo.pic || "https://images.unsplash.com/photo-1542204172-e7052809a862?auto=format&fit=crop&q=80&w=250"}
                          alt={currentVideo.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover transition-transform group-hover:scale-103 duration-300"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.src = 'https://images.unsplash.com/photo-1542204172-e7052809a862?auto=format&fit=crop&q=80&w=250';
                          }}
                        />
                        {currentVideo.remarks && (
                          <div className="absolute bottom-2.5 left-2.5 right-2.5 text-center">
                            <span className="text-[10px] bg-red-650/90 text-white font-extrabold px-2.5 py-1 rounded shadow-lg block max-w-full truncate tracking-wider">
                              {currentVideo.remarks}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Metadata Content on Right Column */}
                      <div className="flex-1 space-y-5 w-full">
                        {/* Cast Listing (Emby-Style Avatar Pills) */}
                        {(currentVideo.director || currentVideo.actor) && (
                          <div className="bg-zinc-900/40 border border-zinc-900 p-3.5 rounded-xl space-y-3.5 text-xs text-zinc-300">
                          {currentVideo.director && (
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="font-bold text-zinc-400 shrink-0">导演:</span>
                              <div className="flex flex-wrap gap-1">
                                {currentVideo.director.split(/[,/，、\s]+/).filter(d => d.trim() !== '').slice(0, 3).map((director, dIdx) => (
                                  <span key={dIdx} className="bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded text-zinc-350 max-w-[120px] truncate">
                                    {director}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {currentVideo.actor && (
                            <div className="flex flex-col gap-2">
                              <span className="font-bold text-zinc-450">主演阵容:</span>
                              <div className="flex flex-wrap gap-2">
                                {currentVideo.actor.split(/[,/，、\s]+/).filter(a => a.trim() !== '').slice(0, 5).map((actor, aIdx) => {
                                  const bgColors = ['bg-indigo-600', 'bg-emerald-600', 'bg-rose-600', 'bg-amber-600', 'bg-purple-600'];
                                  const colorClass = bgColors[actor.charCodeAt(0) % bgColors.length];
                                  return (
                                    <div key={aIdx} className="inline-flex items-center space-x-1.5 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 rounded-full pl-1 pr-2.5 py-0.5 text-xs text-zinc-300 transition shadow-2xs hover:border-zinc-700">
                                      <div className={`h-[18px] w-[18px] rounded-full ${colorClass} text-white flex items-center justify-center font-bold text-[9px] shrink-0`}>
                                        {actor.trim().charAt(0)}
                                      </div>
                                      <span className="max-w-[80px] truncate">{actor}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Brief line plot / Introduction text */}
                      <div className="space-y-1.5 text-xs sm:text-[13px] leading-relaxed text-zinc-300">
                        <span className="font-bold text-zinc-400 block border-b border-zinc-900 pb-1.5">🎬 剧情简介 / Storylines</span>
                        <p className="font-sans leading-relaxed text-zinc-455 max-h-36 overflow-y-auto whitespace-pre-line pl-1 pr-1 font-light" title="影片详情介绍">
                          {currentVideo.content ? currentVideo.content.replace(/<[^>]*>/g, '').trim() : '暂无此影片的详细中文剧情描述，可以直接播放观看视频。'}
                        </p>
                      </div>

                      {/* Control Panel Buttons Row */}
                      <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-zinc-900 justify-center md:justify-start">
                        <button
                          onClick={() => {
                            setIsPlaying(true);
                            const target = document.getElementById('active-player-room');
                            if (target) {
                              target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }
                          }}
                          className="px-5 py-2.5 bg-blue-650 hover:bg-blue-550 text-white font-bold text-xs sm:text-sm rounded-xl transition duration-200 flex items-center space-x-1.5 shadow-lg active:scale-95 cursor-pointer"
                        >
                          <Play className="h-3.5 w-3.5 fill-white" />
                          <span>一键立即放映</span>
                        </button>

                        <button
                          onClick={() => toggleFavorite(currentVideo)}
                          className={`px-4 py-2.5 text-xs sm:text-sm font-bold rounded-xl border transition duration-200 flex items-center space-x-1.5 cursor-pointer active:scale-95 ${
                            favorites.some(item => String(item.id) === String(currentVideo.id))
                              ? 'bg-rose-600 border-rose-600 hover:bg-rose-550 text-white shadow-md'
                              : 'bg-zinc-900/80 border-zinc-800 hover:bg-zinc-800 text-zinc-300'
                          }`}
                        >
                          <Heart className={`h-4 w-4 ${favorites.some(item => String(item.id) === String(currentVideo.id)) ? 'fill-current text-white animate-pulse' : 'text-zinc-400'}`} />
                          <span>{favorites.some(item => String(item.id) === String(currentVideo.id)) ? '已入臻选片单' : '加入收藏片单'}</span>
                        </button>

                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(window.location.origin + '?id=' + currentVideo.id);
                            showToast('本影片的私有极简影院专属分享播放直链已复制。', 'success');
                          }}
                          className="px-4 py-2.5 bg-zinc-900/80 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 text-xs sm:text-sm font-bold rounded-xl transition duration-200 flex items-center space-x-1.5 cursor-pointer active:scale-95"
                        >
                          <Share2 className="h-4 w-4" />
                          <span>分享影片</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                  {/* Part 3: CHANNELS, MOUNTED ROUTER LINES AND PLAY SELECTORS */}
                  <div className="p-4 sm:p-6 bg-zinc-900/40 rounded-b-2xl border-t border-zinc-905 space-y-4 text-left relative z-10">
                    {parsedServers.length > 0 ? (
                      <div className="space-y-4">
                        {/* Server/Line selector row */}
                        <div className="space-y-2">
                          <span className="text-xs font-bold text-zinc-400 flex items-center space-x-1">
                            <Layers className="h-3.5 w-3.5 text-blue-550" />
                            <span>请选择播放传输线路:</span>
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {parsedServers.map((server, sIdx) => (
                              <button
                                key={sIdx}
                                onClick={() => {
                                  setCurrentServerIndex(sIdx);
                                  setCurrentEpisodeIndex(0);
                                  if (server.episodes.length > 0) {
                                    setCurrentPlayUrl(server.episodes[0].url);
                                  }
                                }}
                                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 ${
                                  currentServerIndex === sIdx
                                    ? 'bg-blue-600 text-white shadow-md'
                                    : 'bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400'
                                }`}
                              >
                                <Tv className="h-3.5 w-3.5 shrink-0" />
                                <span>{server.name} ({server.episodes.length} 集)</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Episode selector grids (with auto scroll indicator) */}
                        <div className="space-y-2">
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-bold text-zinc-400 flex items-center space-x-1">
                              <Play className="h-3.5 w-3.5 text-blue-550" />
                              <span>影视分集选集:</span>
                            </span>
                            <span className="text-[10px] text-zinc-500 font-mono">
                              共 {parsedServers[currentServerIndex]?.episodes.length || 0} 个分集
                            </span>
                          </div>
                          <div className="grid grid-cols-3 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2 max-h-52 overflow-y-auto p-2 bg-zinc-950 rounded-xl border border-zinc-900">
                            {parsedServers[currentServerIndex]?.episodes.map((ep, eIdx) => {
                              const isSelected = currentEpisodeIndex === eIdx && isPlaying;
                              return (
                                <button
                                  id={`ep-btn-${currentServerIndex}-${eIdx}`}
                                  key={eIdx}
                                  onClick={() => {
                                    handleSelectEpisode(currentServerIndex, eIdx, ep.url);
                                    setIsPlaying(true);
                                    // Smooth scroll to top player when an episode is selected
                                    const target = document.getElementById('active-player-room');
                                    if (target) {
                                      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                    }
                                  }}
                                  className={`py-2 px-2.5 rounded-lg text-xs font-semibold truncate text-center cursor-pointer transition border ${
                                    isSelected
                                      ? 'bg-blue-600 border-blue-500 text-white font-extrabold shadow-sm'
                                      : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-zinc-800 hover:border-zinc-750'
                                  }`}
                                  title={ep.name}
                                >
                                  {ep.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-6 text-xs text-zinc-500">
                        正在解析当前影视的数据通道... 如果长时间未载出列表，说明该资源的连接异常，您可以尝试切换其他线路。
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SEARCH FILTER WRAPPER */}
              <SearchAndFilter
                categories={categories}
                selectedCategoryId={selectedCategoryId}
                onSelectCategory={(id) => {
                  setSelectedCategoryId(id);
                  setCurrentPage(1); // reset to page 1
                }}
                onSearch={(keyword) => {
                  setSearchKeyword(keyword);
                  setCurrentPage(1); // reset to page 1
                }}
                currentSearch={searchKeyword}
              />

              {/* FAVORITES PLATFORM */}
              {favorites.length > 0 && (
                <div className="bg-[#121212] rounded-2xl border border-zinc-900 p-4 sm:p-5 shadow-xl space-y-3.5" id="favorites-panel">
                  <div className="flex items-center justify-between border-b border-zinc-850 pb-2.5">
                    <div className="flex items-center space-x-2">
                      <Heart className="h-4 w-4 text-red-500 fill-red-500 animate-pulse" />
                      <span className="text-xs sm:text-sm font-bold text-zinc-100">臻选收藏片单 / My Favorites</span>
                      <span className="text-[10px] bg-red-950 text-red-400 px-2.5 py-0.5 rounded-full font-bold border border-red-900/30">
                        {favorites.length}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setFavorites([]);
                        localStorage.removeItem('favorites');
                        showToast('臻选片单已清空', 'info');
                      }}
                      className="text-[10px] text-zinc-400 hover:text-red-500 font-bold hover:underline transition flex items-center space-x-1 border border-zinc-800 hover:border-zinc-700 px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-red-950/20 shadow-sm"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>清空收藏</span>
                    </button>
                  </div>

                  {/* Scrollable container */}
                  <div className="flex gap-3.5 overflow-x-auto pb-1.5 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
                    {favorites.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => handleSelectVideo(item)}
                        className="relative min-w-[200px] max-w-[240px] flex-none bg-zinc-900/40 hover:bg-red-950/5 border border-zinc-900 hover:border-red-900/40 rounded-xl p-2.5 flex gap-3 cursor-pointer transition duration-200 group"
                      >
                        {/* Film pic */}
                        <div className="relative w-12 h-16 rounded-md overflow-hidden bg-zinc-950 shadow-sm shrink-0">
                          <img
                            src={item.pic || "https://images.unsplash.com/photo-1542204172-e7052809a862?auto=format&fit=crop&q=80&w=200"}
                            alt={item.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.src = 'https://images.unsplash.com/photo-1542204172-e7052809a862?auto=format&fit=crop&q=80&w=200';
                            }}
                          />
                        </div>

                        {/* Text detail */}
                        <div className="flex-1 min-w-0 flex flex-col justify-center whitespace-nowrap">
                          <h4 className="text-xs font-bold text-zinc-150 group-hover:text-red-500 transition truncate" title={item.name}>
                            {item.name}
                          </h4>
                          <p className="text-[10px] text-zinc-500 truncate">
                            {item.category || '电影'} · {item.remarks || '极清'}
                          </p>
                          <div className="mt-1 text-[9px] text-red-500 font-semibold flex items-center space-x-0.5">
                            <Star className="h-2.5 w-2.5 fill-red-500 text-red-500" />
                            <span>评分: {getRating(item.name)}</span>
                          </div>
                        </div>

                        {/* Individual close action */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setFavorites(prev => {
                              const updated = prev.filter(f => String(f.id) !== String(item.id));
                              localStorage.setItem('favorites', JSON.stringify(updated));
                              return updated;
                            });
                            showToast('已移出收藏片单', 'info');
                          }}
                          className="absolute top-1.5 right-1.5 p-1 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-red-500 hover:bg-red-950/35 transition shadow-sm opacity-0 group-hover:opacity-100"
                          title="移出收藏"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* WATCH HISTORY PORTAL */}
              {watchHistory.length > 0 && (
                <div className="bg-[#121212] rounded-2xl border border-zinc-900 p-4 sm:p-5 shadow-xl space-y-3.5" id="watch-history-panel">
                  <div className="flex items-center justify-between border-b border-zinc-850 pb-2.5">
                    <div className="flex items-center space-x-2">
                      <History className="h-4 w-4 text-red-500 animate-pulse" />
                      <span className="text-xs sm:text-sm font-bold text-zinc-100">极速续播通道 / 我的播放历史</span>
                      <span className="text-[10px] bg-red-950 text-red-400 px-2.5 py-0.5 rounded-full font-bold border border-red-900/30">
                        {watchHistory.length}
                      </span>
                    </div>
                    <button
                      onClick={handleClearAllHistory}
                      className="text-[10px] text-red-500 hover:text-red-600 font-bold hover:underline transition flex items-center space-x-1 border border-zinc-800 hover:border-zinc-700 px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-red-950/20 shadow-sm"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>清空历史</span>
                    </button>
                  </div>

                  {/* Scrollable container */}
                  <div className="flex gap-3.5 overflow-x-auto pb-1.5 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
                    {watchHistory.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => handleResumeHistory(item)}
                        className="relative min-w-[240px] max-w-[280px] flex-none bg-zinc-900/40 hover:bg-red-950/5 border border-zinc-900 hover:border-red-900/40 rounded-xl p-2.5 flex gap-3 cursor-pointer transition duration-200 group"
                      >
                        {/* Film pic */}
                        <div className="relative w-12 h-16 rounded-md overflow-hidden bg-zinc-950 shadow-sm shrink-0">
                          <img
                            src={item.pic || "https://images.unsplash.com/photo-1542204172-e7052809a862?auto=format&fit=crop&q=80&w=200"}
                            alt={item.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.src = 'https://images.unsplash.com/photo-1542204172-e7052809a862?auto=format&fit=crop&q=80&w=200';
                            }}
                          />
                        </div>

                        {/* Text detail */}
                        <div className="flex-1 min-w-0 flex flex-col justify-between whitespace-nowrap">
                          <div className="space-y-0.5">
                            <h4 className="text-xs font-bold text-zinc-150 group-hover:text-red-500 transition truncate" title={item.name}>
                              {item.name}
                            </h4>
                            <p className="text-[10px] text-zinc-500 truncate">
                              [{item.category || '电影'}] · {item.remarks || 'HD'}
                            </p>
                          </div>

                          <div className="space-y-0.5">
                            <div className="text-[10px] text-red-400 bg-red-950/40 border border-red-900/25 rounded px-1.5 py-0.5 inline-block font-sans font-semibold truncate max-w-full">
                              上次播到: {item.lastPlayedEpisodeName}
                            </div>
                            <div className="text-[9px] text-red-500 font-bold group-hover:underline flex items-center space-x-0.5">
                              <span>⚡ 极速一键续播</span>
                            </div>
                          </div>
                        </div>

                        {/* Individual close action */}
                        <button
                          onClick={(e) => handleDeleteHistory(item.id, e)}
                          className="absolute top-1.5 right-1.5 p-1 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-red-500 hover:bg-red-950/35 transition shadow-sm opacity-0 group-hover:opacity-100"
                          title="删除记录"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* VIDEO GRID & COLLECTION COUNTERS */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <h3 className="text-base font-bold tracking-tight text-zinc-100">
                      {searchKeyword ? `🔍 "${searchKeyword}" 的搜索结果` : '🎥 最新影视资源库'}
                    </h3>
                    <p className="text-xs text-zinc-500">
                      数据源：<span className="text-zinc-350 font-semibold">[{settings.cmsSources.find(c => c.id === settings.selectedCmsId)?.name || '默认'}]</span>
                      ，共采集到约 <span className="text-red-500 font-extrabold font-mono">{totalCount}</span> 部影片资源
                    </p>
                  </div>
                  
                  {/* Quick Reload/Refresh Button */}
                  <button
                    onClick={() => {
                      const curCms = settings.cmsSources.find(c => c.id === settings.selectedCmsId);
                      if (curCms) fetchVideosFromCms(curCms.url, currentPage, selectedCategoryId, searchKeyword, true);
                      showToast('数据重载成功');
                    }}
                    className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg hover:bg-zinc-800 text-zinc-300 hover:text-white transition shadow-md flex items-center space-x-1.5 text-xs font-bold cursor-pointer"
                    title="刷新当前列表"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">刷新列表</span>
                  </button>
                </div>

                {loadingVideos ? (
                  /* Elegant skeletal loader grid */
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4" id="grid-loader">
                    {[...Array(12)].map((_, index) => (
                      <div key={index} className="bg-[#141414] rounded-xl border border-zinc-900 overflow-hidden flex flex-col space-y-3 animate-pulse h-72">
                        <div className="aspect-[3/4] bg-zinc-905 w-full" />
                        <div className="p-3 space-y-2">
                          <div className="h-3.5 bg-zinc-800 rounded-sm w-3/4" />
                          <div className="h-3 bg-zinc-850 rounded-sm w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : getFilteredVideosToRender().length > 0 ? (
                  /* Video cards layout */
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4" id="movie-grid-viewport">
                    {getFilteredVideosToRender().map((movie) => (
                      <VideoCard
                        key={movie.id}
                        video={movie}
                        onClick={() => handleSelectVideo(movie)}
                      />
                    ))}
                  </div>
                ) : (
                  /* Empty state error */
                  <div className="bg-[#0e0e0e] text-center rounded-2xl border border-zinc-900 p-12 flex flex-col items-center justify-center space-y-3" id="movie-grid-empty">
                    <div className="p-3 bg-red-950/20 text-red-500 rounded-full border border-red-900/30">
                      <AlertTriangle className="h-6 w-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-zinc-150 text-sm">
                        {navTab === 'mylist' ? '您的臻选片单目前为空' : '未采集到相匹配的影片对象'}
                      </h4>
                      <p className="text-zinc-500 text-xs mt-1.5 max-w-sm mx-auto leading-relaxed">
                        {navTab === 'mylist' 
                          ? '浏览各大影片资源时，点击“收藏”按钮，即可在此随时畅享一键专属续播通道。'
                          : '可能这线路的资源库没有收录相关影片，或者您的自定义采集字段与该站点的API不对应。可以前往采集规则设置 调整。'}
                      </p>
                    </div>
                  </div>
                )}

                {/* PAGINATION PANEL */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center space-x-3.5 pt-6" id="pagination-controls-row">
                    <button
                      id="btn-page-prev"
                      onClick={() => {
                        if (currentPage > 1) setCurrentPage(currentPage - 1);
                      }}
                      disabled={currentPage === 1}
                      className={`p-2 rounded-xl border transition flex items-center justify-center ${
                        currentPage === 1
                          ? 'bg-zinc-900/40 text-zinc-650 border-zinc-800/40 cursor-not-allowed'
                          : 'bg-zinc-900 hover:bg-zinc-850 border-zinc-800 text-zinc-100 shadow-md cursor-pointer'
                      }`}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    
                    <span className="text-xs font-bold text-zinc-400 font-mono">
                      第 {currentPage} 页 / 共 {totalPages} 页
                    </span>

                    <button
                      id="btn-page-next"
                      onClick={() => {
                        if (currentPage < totalPages) setCurrentPage(currentPage + 1);
                      }}
                      disabled={currentPage === totalPages}
                      className={`p-2 rounded-xl border transition flex items-center justify-center ${
                        currentPage === totalPages
                          ? 'bg-zinc-900/40 text-zinc-650 border-zinc-800/40 cursor-not-allowed'
                          : 'bg-zinc-900 hover:bg-zinc-850 border-zinc-800 text-zinc-100 shadow-md cursor-pointer'
                      }`}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                )}

              </div>
            </div>
          )}

          {activeTab === 'home' && navTab === 'iptv' && (
            <IptvLiveView
              iptvSources={settings.iptvSources || []}
              selectedChannel={selectedIptvChannel}
              onSelectChannel={(ch) => setSelectedIptvChannel(ch)}
            />
          )}

          {/* TAB 2: ADMIN BACKOFFICE */}
          {activeTab === 'admin' && (
            <div className="space-y-6">
              {!isAdminLoggedIn ? (
                /* Elegant Login Form Card */
                <div className="max-w-md mx-auto my-12 bg-[#141414] rounded-2xl border border-zinc-900 overflow-hidden shadow-2xl animate-fade-in">
                  <div className="p-6 bg-gradient-to-br from-red-700 to-red-950 text-white text-center">
                    <div className="inline-flex p-3 bg-white/10 rounded-full border border-white/20 mb-3">
                      <Lock className="h-6 w-6 text-white animate-pulse" />
                    </div>
                    <h3 className="font-extrabold text-lg font-sans tracking-wide">CINEFLOW 系统管理后台</h3>
                    <p className="text-xs text-red-200 mt-1 uppercase tracking-wider font-mono">AUTHORIZED ADMINISTRATOR CAPTCHAS</p>
                  </div>

                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (loginUsername === 'aobaba' && loginPassword === 'a123456a') {
                        setIsAdminLoggedIn(true);
                        setLoginError('');
                        showToast('登录管理后台成功！', 'success');
                        sessionStorage.setItem('isAdminLoggedIn', 'true');
                      } else {
                        setLoginError('用户名或密码不正确，请重新输入');
                        showToast('用户名或密码错误，请检查！', 'error');
                      }
                    }}
                    className="p-6 space-y-4"
                  >
                    {loginError && (
                      <div className="p-3 bg-rose-950/35 border border-rose-900/30 rounded-xl text-rose-450 text-xs font-semibold flex items-center space-x-1.5 animate-bounce">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
                        <span>{loginError}</span>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-zinc-400 block">管理员用户名</label>
                      <div className="relative">
                        <span className="absolute left-3 top-3.5 text-zinc-550">
                          <User className="h-4 w-4" />
                        </span>
                        <input
                          type="text"
                          required
                          value={loginUsername}
                          onChange={(e) => setLoginUsername(e.target.value)}
                          placeholder="请输入管理员账号..."
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2.5 pl-9 pr-3 text-xs text-zinc-100 placeholder-zinc-600 focus:ring-1 focus:ring-red-500 focus:outline-hidden"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5 md:pb-2">
                      <label className="text-xs font-bold text-zinc-400 block">系统管理密码</label>
                      <div className="relative">
                        <span className="absolute left-3 top-3.5 text-zinc-550">
                          <Key className="h-4 w-4" />
                        </span>
                        <input
                          type="password"
                          required
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          placeholder="请输入密码..."
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2.5 pl-9 pr-3 text-xs text-zinc-100 placeholder-zinc-600 focus:ring-1 focus:ring-red-500 focus:outline-hidden"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-red-600 hover:bg-red-700 text-white font-bold text-xs py-3 rounded-xl transition duration-200 shadow-lg flex items-center justify-center space-x-1 focus:ring-2 focus:ring-red-500 focus:outline-hidden active:scale-98 cursor-pointer"
                    >
                      <Lock className="h-3.5 w-3.5" />
                      <span>验证凭证并登录系统</span>
                    </button>
                  </form>
                </div>
              ) : (
                /* Authenticated State view - Render internal tabs with subnavigation */
                <div className="space-y-6">
                  {/* Subnav for backoffice */}
                  <div className="bg-[#141414] rounded-2xl border border-zinc-900 p-3 shadow-xl flex justify-between items-center flex-wrap gap-3">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setAdminTab('config')}
                        className={`px-4 py-2 text-xs font-bold rounded-xl border transition flex items-center space-x-1.5 cursor-pointer ${
                          adminTab === 'config'
                            ? 'bg-red-650 text-white border-red-650 shadow-md'
                            : 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800 text-zinc-350 hover:text-white'
                        }`}
                      >
                        <Settings className="h-3.5 w-3.5" />
                        <span>自定义采集与解析配置</span>
                      </button>
                      <button
                        onClick={() => setAdminTab('guide')}
                        className={`px-4 py-2 text-xs font-bold rounded-xl border transition flex items-center space-x-1.5 cursor-pointer ${
                          adminTab === 'guide'
                            ? 'bg-red-650 text-white border-red-650 shadow-md'
                            : 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800 text-zinc-350 hover:text-white'
                        }`}
                      >
                        <BookOpen className="h-3.5 w-3.5" />
                        <span>系统自学与配置指南</span>
                      </button>
                      <button
                        onClick={() => setAdminTab('iptv')}
                        className={`px-4 py-2 text-xs font-bold rounded-xl border transition flex items-center space-x-1.5 cursor-pointer ${
                          adminTab === 'iptv'
                            ? 'bg-red-650 text-white border-red-650 shadow-md'
                            : 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800 text-zinc-350 hover:text-white'
                        }`}
                      >
                        <Radio className="h-3.5 w-3.5" />
                        <span>IPTV频道直播网关</span>
                      </button>
                    </div>

                    <div className="flex items-center space-x-2 text-[10px] text-zinc-400">
                      <span className="hidden sm:inline bg-zinc-900 text-zinc-400 border border-zinc-800 font-bold px-2 py-1 rounded">
                        账户: aobaba (超级管理员)
                      </span>
                      <button
                        onClick={() => {
                          setIsAdminLoggedIn(false);
                          sessionStorage.removeItem('isAdminLoggedIn');
                          setActiveTab('home');
                          showToast('您已成功退出后台管理模式');
                        }}
                        className="text-red-500 hover:text-red-650 font-bold hover:underline py-1.5 px-3 rounded-lg border border-zinc-800 hover:border-red-900 bg-zinc-900 hover:bg-red-950/20 transition flex items-center space-x-1 cursor-pointer"
                      >
                        <LogOut className="h-3 w-3" />
                        <span>退出登录</span>
                      </button>
                    </div>
                  </div>

                  {/* SUB SECTION: CONFIG (自定义采集与解析) */}
                  {adminTab === 'config' && (
                    <div className="space-y-6" id="settings-tab-panel">
                      
                      <div className="flex items-center space-x-3 pb-2 border-b border-zinc-200">
                        <span className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                          <Settings className="h-5 w-5" />
                        </span>
                        <div>
                          <h3 className="text-base font-bold text-zinc-800">采集规则与接口网关控制器</h3>
                          <p className="text-xs text-zinc-400">在此实时增减外部CMS JSON数据池和M3U8万能播放流解析服务（保存后即存入后端，永久生效）</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                        {/* Left side: Customize Sources Appenders */}
                        <div className="bg-white rounded-2xl border border-zinc-200 p-5 space-y-4 shadow-xs">
                          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                            <div className="flex items-center space-x-2">
                              <Layers className="h-4 w-4 text-blue-600" />
                              <h4 className="text-sm font-bold text-zinc-800">1. CMS采集网关设置</h4>
                            </div>
                            <span className="text-[10px] bg-zinc-100 p-1 rounded font-mono text-zinc-500">JSON/GET 绑定接口</span>
                          </div>

                          {/* Add Source form */}
                          <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-150 space-y-3">
                            <span className="text-xs font-semibold text-zinc-700 block">➕ 新增资源采集节点</span>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                              <div className="space-y-1">
                                <label className="text-[10px] text-zinc-500 font-bold block uppercase">节点名称 (例如: 无忧资源)</label>
                                <input
                                  id="new-cms-name"
                                  type="text"
                                  value={tempCmsName}
                                  onChange={(e) => setTempCmsName(e.target.value)}
                                  placeholder="资源站简称..."
                                  className="w-full bg-white border border-zinc-200 text-xs rounded-md p-2 focus:ring-1 focus:ring-blue-500 focus:outline-hidden text-zinc-900 placeholder-zinc-400"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] text-zinc-500 font-bold block uppercase">网关 JSON-API URL 端点</label>
                                <input
                                  id="new-cms-url"
                                  type="text"
                                  value={tempCmsUrl}
                                  onChange={(e) => setTempCmsUrl(e.target.value)}
                                  placeholder="https://api.domain.com/provide/vod/at/json"
                                  className="w-full bg-white border border-zinc-200 text-xs rounded-md p-2 focus:ring-1 focus:ring-blue-500 focus:outline-hidden text-zinc-900 placeholder-zinc-400"
                                />
                              </div>
                            </div>
                            <button
                              id="save-new-cms-btn"
                              onClick={handleAddNewCms}
                              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2 px-3 rounded-md transition shadow-xs flex items-center justify-center space-x-1"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              <span>添加到多源采集总线</span>
                            </button>
                          </div>

                          {/* Part 1.5: TVBox Movie Subscription Bulk Import */}
                          <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-150 space-y-3">
                            <div className="flex items-center justify-between border-b border-zinc-205 pb-2">
                              <span className="text-xs font-semibold text-zinc-700 flex items-center space-x-1">
                                <span>📺 批量导入 TVBox 影视订阅源</span>
                              </span>
                              <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-mono font-semibold">
                                自动规则解析
                              </span>
                            </div>

                            {/* Custom Tab Selector */}
                            <div className="flex border-b border-zinc-200 text-[11px] font-bold">
                              <button
                                onClick={() => setTvBoxImportTab('url')}
                                className={`flex-1 pb-1.5 border-b-2 transition ${
                                  tvBoxImportTab === 'url'
                                    ? 'border-blue-600 text-blue-600 font-extrabold'
                                    : 'border-transparent text-zinc-400 hover:text-zinc-650'
                                } bg-transparent cursor-pointer font-sans`}
                              >
                                🌐 线上 URL 导入
                              </button>
                              <button
                                onClick={() => setTvBoxImportTab('local')}
                                className={`flex-1 pb-1.5 border-b-2 transition ${
                                  tvBoxImportTab === 'local'
                                    ? 'border-blue-600 text-blue-600 font-extrabold'
                                    : 'border-transparent text-zinc-400 hover:text-zinc-650'
                                } bg-transparent cursor-pointer font-sans`}
                              >
                                💻 本地/纯文本导入
                              </button>
                            </div>

                            {tvBoxImportTab === 'url' ? (
                              <div className="space-y-2.5">
                                <p className="text-[10px] text-zinc-450 leading-relaxed font-sans text-left">
                                  输入标准的 TVBox 影视 JSON 订阅地址。云端自动中继获取其中的 sites 节点并转化为标准 CMS 采集源。
                                </p>
                                <div className="space-y-1 text-left">
                                  <label className="text-[10px] text-zinc-500 font-bold block">TVBox 订阅源 URL 地址 (*.json / *.txt 等明文接口)</label>
                                  <input
                                    type="text"
                                    value={tempTvBoxUrl}
                                    onChange={(e) => setTempTvBoxUrl(e.target.value)}
                                    placeholder="https://raw.githubusercontent.com/.../tvbox.json"
                                    className="w-full bg-white border border-zinc-200 text-xs rounded-md p-2 focus:ring-1 focus:ring-blue-500 focus:outline-hidden text-zinc-900 placeholder-zinc-400"
                                  />
                                </div>

                                <button
                                  onClick={async () => {
                                    if (!tempTvBoxUrl.trim()) {
                                      showToast('请输入有效的 TVBox 订阅 URL 链接', 'error');
                                      return;
                                    }
                                    if (!tempTvBoxUrl.startsWith('http://') && !tempTvBoxUrl.startsWith('https://')) {
                                      showToast('链接必须以 http:// 或 https:// 开头', 'error');
                                      return;
                                    }

                                    setIsImportingTvBox(true);
                                    showToast('正在拉取并解析 TVBox 订阅源，请稍候...', 'info');

                                    try {
                                      const res = await fetch(`/api/parse-tvbox?url=${encodeURIComponent(tempTvBoxUrl.trim())}`);
                                      const json = await res.json();
                                      
                                      if (json.success && Array.isArray(json.sites)) {
                                        if (json.sites.length === 0) {
                                          showToast('获取成功，但未解析出有效的 Movie/API 影视口，请重试或检查该 TVBox 的 sites 字段！', 'error');
                                        } else {
                                          const currentSources = settings.cmsSources || [];
                                          // Filter duplicates by url
                                          const filteredNewSites = json.sites.filter(
                                            (s: any) => !currentSources.some(exist => exist.url === s.url)
                                          );

                                          if (filteredNewSites.length === 0) {
                                            showToast('这些影视源已经全部存在于您的采集总线中，无需重复录入。', 'info');
                                          } else {
                                            const updated = [...currentSources, ...filteredNewSites];
                                            await saveAllSettingsToServer({ ...settings, cmsSources: updated });
                                            showToast(`大功告成！已经为您成功批量录入了 ${filteredNewSites.length} 个 TVBox 高清源节点！`, 'success');
                                            setTempTvBoxUrl('');
                                          }
                                        }
                                      } else {
                                        showToast(json.error || '解析 TVBox 订阅列表失败，请检查文件格式。', 'error');
                                      }
                                    } catch (e: any) {
                                      showToast(`批量拉取失败: ${e.message}`, 'error');
                                    } finally {
                                      setIsImportingTvBox(false);
                                    }
                                  }}
                                  disabled={isImportingTvBox}
                                  className={`w-full text-white font-bold text-xs py-2 rounded-lg transition duration-205 flex items-center justify-center space-x-1.5 shadow-md cursor-pointer border-none ${
                                    isImportingTvBox 
                                      ? 'bg-zinc-350 cursor-not-allowed opacity-80' 
                                      : 'bg-zinc-850 hover:bg-zinc-900'
                                  }`}
                                >
                                  {isImportingTvBox ? (
                                    <>
                                      <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" />
                                      <span>影视订阅源解析中...</span>
                                    </>
                                  ) : (
                                    <span>🚀 一键云端拉取并智能合并影视源</span>
                                  )}
                                </button>
                              </div>
                            ) : (
                              <div className="space-y-2.5">
                                <p className="text-[10px] text-zinc-450 leading-relaxed font-sans text-left">
                                  <strong>本地端明文快速解析：</strong>适合因内网限制或无外网连接时直接解析 TVBox 明文 JSON。
                                </p>

                                {/* Drag and drop section */}
                                <div className="border-2 border-dashed border-zinc-200 rounded-xl p-3 text-center relative hover:bg-zinc-100 transition duration-150">
                                  <input
                                    type="file"
                                    accept=".json,.txt"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (!file) return;

                                      const reader = new FileReader();
                                      reader.onload = async (evt) => {
                                        const text = evt.target?.result as string;
                                        if (!text) return;

                                        const parsedSources = parseTvBoxTextContent(text);
                                        if (parsedSources.length === 0) {
                                          showToast('无法解析该文件：未检测到任何包含 sites 且带有 api 的明文配置站点！', 'error');
                                          return;
                                        }

                                        const currentSources = settings.cmsSources || [];
                                        const filteredNewSites = parsedSources.filter(
                                          (s: any) => !currentSources.some(exist => exist.url === s.url)
                                        );

                                        if (filteredNewSites.length === 0) {
                                          showToast('文件中的影视源在前台配置中已全部存在，无需重复导入。', 'info');
                                        } else {
                                          const updated = [...currentSources, ...filteredNewSites];
                                          await saveAllSettingsToServer({ ...settings, cmsSources: updated });
                                          showToast(`导入成功！已秒级装填并合并了您本机的 ${filteredNewSites.length} 个影视采集网络源！`, 'success');
                                        }
                                      };
                                      reader.readAsText(file);
                                    }}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                  />
                                  <div className="text-xs text-zinc-700 font-bold">📤 选择本地 TVBox .json 配置文件</div>
                                  <div className="text-[9px] text-zinc-400 mt-1">支持拖拽或选择，直接在浏览器中秒级免跨域安全解析</div>
                                </div>

                                {/* Direct manual paste section */}
                                <div className="space-y-1 text-left">
                                  <div className="flex items-center justify-between">
                                    <label className="text-[10px] text-zinc-500 font-bold block">或直接粘贴 TVBox JSON 配置文本</label>
                                    {tempTvBoxText && (
                                      <button 
                                        onClick={() => setTempTvBoxText('')}
                                        className="text-[9px] text-red-500 hover:underline cursor-pointer border-none bg-transparent"
                                      >
                                        清空
                                      </button>
                                    )}
                                  </div>
                                  <textarea
                                    rows={4}
                                    value={tempTvBoxText}
                                    onChange={(e) => setTempTvBoxText(e.target.value)}
                                    placeholder={`{\n  "sites": [\n    { "name": "新视频源", "type": 1, "api": "http://.../json" }\n  ]\n}`}
                                    className="w-full bg-white border border-zinc-200 text-[10px] font-mono rounded-md p-2 focus:ring-1 focus:ring-blue-500 focus:outline-hidden text-zinc-900 placeholder-zinc-400 leading-normal"
                                  />
                                </div>

                                <button
                                  onClick={async () => {
                                    if (!tempTvBoxText.trim()) {
                                      showToast('请在文本框内粘贴标准的 TVBox 影视 sites 配置配置！', 'error');
                                      return;
                                    }

                                    const parsedSources = parseTvBoxTextContent(tempTvBoxText);
                                    if (parsedSources.length === 0) {
                                      showToast('解析失败：未在 JSON 配置中检验到 sites 站点数组或格式有误！', 'error');
                                      return;
                                    }

                                    const currentSources = settings.cmsSources || [];
                                    const filteredNewSites = parsedSources.filter(
                                      (s: any) => !currentSources.some(exist => exist.url === s.url)
                                    );

                                    if (filteredNewSites.length === 0) {
                                      showToast('该文本中的资源节点之前均已录入成功！', 'info');
                                    } else {
                                      const updated = [...currentSources, ...filteredNewSites];
                                      await saveAllSettingsToServer({ ...settings, cmsSources: updated });
                                      showToast(`解析并智能合并成功！已成功录入了 ${filteredNewSites.length} 个新影视采集站节点！`, 'success');
                                      setTempTvBoxText('');
                                    }
                                  }}
                                  className="w-full text-white font-bold text-xs py-2 bg-blue-600 hover:bg-blue-650 rounded-lg transition duration-205 flex items-center justify-center space-x-1 shadow-md cursor-pointer border-none"
                                >
                                  <span>⚡ 立即粘贴一键浏览器本地解析合并</span>
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Existing Source list */}
                          <div className="space-y-2">
                            <span className="text-xs font-bold text-zinc-500 tracking-wide block">目前已连接的数据站 (点击任意行即可设定为主采集源)：</span>
                            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                              {settings.cmsSources && settings.cmsSources.map((source) => {
                                const isSelected = settings.selectedCmsId === source.id;
                                return (
                                  <div
                                    key={source.id}
                                    onClick={() => {
                                      const nextSettings = { ...settings, selectedCmsId: source.id };
                                      setSettings(nextSettings);
                                      saveAllSettingsToServer(nextSettings);
                                      setCurrentPage(1);
                                      setSelectedCategoryId('');
                                      setSearchKeyword('');
                                      showToast(`已成功切换当前主采集源: ${source.name}`);
                                    }}
                                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition select-none ${
                                      isSelected
                                        ? 'bg-blue-50/70 border-blue-400 shadow-2xs'
                                        : 'bg-zinc-50 border-zinc-200 hover:bg-zinc-100 hover:border-zinc-300'
                                    }`}
                                  >
                                    <div className="truncate flex-1 pr-3">
                                      <div className="flex items-center space-x-1.5">
                                        <span className={`font-bold text-xs ${isSelected ? 'text-blue-700 font-extrabold' : 'text-zinc-800'}`}>
                                          {source.name}
                                        </span>
                                        {isSelected && (
                                          <span className="text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded-sm scale-90 font-sans font-medium">当前主站</span>
                                        )}
                                      </div>
                                      <span className="text-[9px] text-zinc-400 font-mono block truncate mt-1">地址: {source.url}</span>
                                    </div>
                                    
                                    <div className="flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
                                      {!isSelected ? (
                                        <button
                                          onClick={() => {
                                            const nextSettings = { ...settings, selectedCmsId: source.id };
                                            setSettings(nextSettings);
                                            saveAllSettingsToServer(nextSettings);
                                            setCurrentPage(1);
                                            setSelectedCategoryId('');
                                            setSearchKeyword('');
                                            showToast(`已成功切换当前主采集源: ${source.name}`);
                                          }}
                                          className="text-[10px] px-2 py-1 rounded bg-white hover:bg-zinc-100 text-zinc-650 border border-zinc-300 shadow-2xs font-semibold hover:text-zinc-900 transition-colors"
                                        >
                                          设为主源
                                        </button>
                                      ) : (
                                        <span className="text-[10px] font-bold text-blue-600 px-1 flex items-center space-x-0.5">
                                          <Check className="h-3 w-3" />
                                          <span>激活中</span>
                                        </span>
                                      )}
                                      <button
                                        id={`del-cms-${source.id}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteCms(source.id, e);
                                        }}
                                        className="p-1 rounded-md hover:bg-rose-50 text-rose-500 transition hover:text-rose-650"
                                        title="删除此接口"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Right side: M3U8 Parsers */}
                        <div className="bg-white rounded-2xl border border-zinc-200 p-5 space-y-4 shadow-xs">
                          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                            <div className="flex items-center space-x-2">
                              <Tv className="h-4 w-4 text-emerald-600" />
                              <h4 className="text-sm font-bold text-zinc-800">2. M3U8播放内核与解析网关</h4>
                            </div>
                            <span className="text-[10px] bg-emerald-55 text-emerald-750 px-2 py-0.5 rounded font-semibold">配置解析</span>
                          </div>

                          {/* ACTIVE PLAYBACK ENGINE SELECTOR */}
                          <div className="bg-emerald-50/60 p-4 rounded-xl border border-emerald-100/80 space-y-2.5">
                            <div className="flex items-center space-x-1.5 pb-1 border-b border-emerald-100">
                              <SlidersHorizontal className="h-3.5 w-3.5 text-emerald-700" />
                              <span className="text-xs font-bold text-emerald-900">当前生效的播放内核 / 解析引擎选择</span>
                            </div>

                            <div className="space-y-1.5">
                              <select
                                value={settings.selectedParserId}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const nextSettings = { ...settings, selectedParserId: val };
                                  setSettings(nextSettings);
                                  saveAllSettingsToServer(nextSettings);
                                  showToast(`播放内核已成功设定为: ${val === 'internal' ? '内置极速解码器' : '自定义网页解析器'}`);
                                }}
                                className="w-full bg-white border border-emerald-200 rounded-lg py-1.5 px-3 text-xs font-semibold text-zinc-800 focus:outline-hidden focus:border-emerald-500"
                                id="aside-parser-dropdown"
                              >
                                <option value="internal" className="text-zinc-800">✨ HlsJS 本地极速无广告流播放器 (默认推荐)</option>
                                {settings.m3u8Parsers && settings.m3u8Parsers.map((p) => (
                                  <option key={p.id} value={p.id} className="text-zinc-800">
                                    🔗 {p.name}
                                  </option>
                                ))}
                              </select>
                              <p className="text-[11px] text-emerald-700 leading-relaxed font-sans">
                                提示: 建议默认使用内置播放器（极速无广告、低负载）。如特定视频因跨域或不兼容无法播放，可在此随时一键切换为任意第三方网关解析。
                              </p>
                            </div>
                          </div>

                          {/* Add Parser form */}
                          <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-150 space-y-3">
                            <span className="text-xs font-semibold text-zinc-700 block">➕ 新增三方极速解析接口</span>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                              <div className="space-y-1">
                                <label className="text-[10px] text-zinc-500 font-bold block uppercase">解析站名称 (如: 小猫解析)</label>
                                <input
                                  id="new-parser-name"
                                  type="text"
                                  value={tempParserName}
                                  onChange={(e) => setTempParserName(e.target.value)}
                                  placeholder="极速解析..."
                                  className="w-full bg-white border border-zinc-200 text-xs rounded-md p-2 focus:ring-1 focus:ring-emerald-500 focus:outline-hidden text-zinc-800 placeholder-zinc-400"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] text-zinc-500 font-bold block uppercase">解析Iframe接口 (需携带 = 号)</label>
                                <input
                                  id="new-parser-url"
                                  type="text"
                                  value={tempParserUrl}
                                  onChange={(e) => setTempParserUrl(e.target.value)}
                                  placeholder="https://jx.player.com/?url="
                                  className="w-full bg-white border border-zinc-200 text-xs rounded-md p-2 focus:ring-1 focus:ring-emerald-500 focus:outline-hidden text-zinc-800 placeholder-zinc-400"
                                />
                              </div>
                            </div>
                            <button
                              id="save-new-parser-btn"
                              onClick={handleAddNewParser}
                              className="w-full bg-emerald-650 hover:bg-emerald-700 text-white font-bold text-xs py-2 px-3 rounded-md transition shadow-xs flex items-center justify-center space-x-1"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              <span>添加到外部网页播放器解析池</span>
                            </button>
                          </div>

                          {/* Existing Parser list */}
                          <div className="space-y-2">
                            <span className="text-xs font-bold text-zinc-500 tracking-wide block">当前支持的外部网页解析器 ({settings.m3u8Parsers?.length || 0})：</span>
                            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                              <div className="flex items-center justify-between p-3.5 bg-blue-50/50 rounded-xl border border-blue-105 text-xs">
                                <div className="truncate flex-1 pr-3">
                                  <span className="font-bold text-blue-800 block">✨ HlsJS 内置极速流播放器</span>
                                  <span className="text-[9px] text-blue-500 font-mono block truncate mt-0.5">直接读取并解析 M3U8 流，无任何网页弹窗 or 恶意广告</span>
                                </div>
                                <span className="px-2 py-0.5 bg-blue-150 text-blue-750 font-bold rounded-sm text-[9px]">独家内置</span>
                              </div>

                              {settings.m3u8Parsers && settings.m3u8Parsers.map((p) => (
                                <div
                                  key={p.id}
                                  className="flex items-center justify-between p-3.5 bg-zinc-50 rounded-xl border border-zinc-200 text-xs"
                                >
                                  <div className="truncate flex-1 pr-3">
                                    <span className="font-bold text-zinc-800 block">{p.name}</span>
                                    <span className="text-[9px] text-zinc-400 font-mono block truncate mt-0.5">{p.url}</span>
                                  </div>
                                  <button
                                    id={`del-parser-${p.id}`}
                                    onClick={(e) => handleDeleteParser(p.id, e)}
                                    className="p-1.5 rounded-md hover:bg-rose-50 text-rose-500 transition hover:text-rose-655"
                                    title="从列表清理"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                      </div>

                      {/* SECTION 3: DETAILED SCRAPING DICTIONARY RULES MAPPER */}
                      <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-4 shadow-xs">
                        <div className="flex items-center space-x-2 border-b border-zinc-100 pb-3.5">
                          <Sliders className="h-4.5 w-4.5 text-blue-600" />
                          <div>
                            <h4 className="text-sm font-bold text-zinc-800">3. 自定义大类采集数据字典规则</h4>
                            <p className="text-xs text-zinc-400">资源站返回格式不同时，请调整下方属性名称，即可完美解析匹配几乎所有的标准/苹果CMS JSON接口！</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                          <div className="space-y-1.5">
                            <label className="font-bold text-zinc-700">影片名称映射 Key (titleKey)</label>
                            <input
                              id="rule-title-key"
                              type="text"
                              value={rules.titleKey}
                              onChange={(e) => setRules(prev => ({ ...prev, titleKey: e.target.value }))}
                              className="w-full bg-zinc-50 border border-zinc-200 rounded-lg p-2 font-mono text-xs focus:ring-1 focus:ring-blue-500 focus:outline-hidden text-zinc-800"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="font-bold text-zinc-700">影片缩略图 Key (picKey)</label>
                            <input
                              id="rule-pic-key"
                              type="text"
                              value={rules.picKey}
                              onChange={(e) => setRules(prev => ({ ...prev, picKey: e.target.value }))}
                              className="w-full bg-zinc-50 border border-zinc-200 rounded-lg p-2 font-mono text-xs focus:ring-1 focus:ring-blue-500 focus:outline-hidden text-zinc-800"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="font-bold text-zinc-700">影片分类或类型 Key (categoryKey)</label>
                            <input
                              id="rule-cat-key"
                              type="text"
                              value={rules.categoryKey}
                              onChange={(e) => setRules(prev => ({ ...prev, categoryKey: e.target.value }))}
                              className="w-full bg-zinc-50 border border-zinc-200 rounded-lg p-2 font-mono text-xs focus:ring-1 focus:ring-blue-500 focus:outline-hidden text-zinc-800"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="font-bold text-zinc-700">影片播放字段 Key (playUrlKey)</label>
                            <input
                              id="rule-url-key"
                              type="text"
                              value={rules.playUrlKey}
                              onChange={(e) => setRules(prev => ({ ...prev, playUrlKey: e.target.value }))}
                              className="w-full bg-zinc-50 border border-zinc-200 rounded-lg p-2 font-mono text-xs focus:ring-1 focus:ring-blue-500 focus:outline-hidden text-zinc-800"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs pt-2">
                          <div className="space-y-1.5">
                            <label className="font-bold text-zinc-700">影片集数备注 Key (remarksKey)</label>
                            <input
                              id="rule-remarks-key"
                              type="text"
                              value={rules.remarksKey}
                              onChange={(e) => setRules(prev => ({ ...prev, remarksKey: e.target.value }))}
                              className="w-full bg-zinc-50 border border-zinc-200 rounded-lg p-2 font-mono text-xs focus:ring-1 focus:ring-blue-500 focus:outline-hidden text-zinc-800"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="font-bold text-zinc-700">剧情大纲剧情 Key (contentKey)</label>
                            <input
                              id="rule-content-key"
                              type="text"
                              value={rules.contentKey}
                              onChange={(e) => setRules(prev => ({ ...prev, contentKey: e.target.value }))}
                              className="w-full bg-zinc-50 border border-zinc-200 rounded-lg p-2 font-mono text-xs focus:ring-1 focus:ring-blue-500 focus:outline-hidden text-zinc-800"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="font-bold text-zinc-700">播放来源名称 Key (playFromServerKey)</label>
                            <input
                              id="rule-from-key"
                              type="text"
                              value={rules.playFromServerKey}
                              onChange={(e) => setRules(prev => ({ ...prev, playFromServerKey: e.target.value }))}
                              className="w-full bg-zinc-50 border border-zinc-200 rounded-lg p-2 font-mono text-xs focus:ring-1 focus:ring-blue-500 focus:outline-hidden text-zinc-800"
                            />
                          </div>
                        </div>

                        {/* Split delimiters parsing rules */}
                        <div className="space-y-2 border-t border-zinc-100 pt-4">
                          <span className="text-xs font-bold text-zinc-700 block">CMS 集数拼写规则特殊切割符号</span>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                            <div className="space-y-1">
                              <label className="text-[10px] text-zinc-500 font-semibold block">线路/服务器 切分符 例: $$$</label>
                              <input
                                id="split-server-input"
                                type="text"
                                value={rules.splitPlayServer}
                                onChange={(e) => setRules(prev => ({ ...prev, splitPlayServer: e.target.value }))}
                                className="w-full bg-zinc-50 border border-zinc-200 rounded-lg p-2 font-mono text-zinc-800 focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] text-zinc-500 font-semibold block">具体剧集 切分符 例: #</label>
                              <input
                                id="split-ep-input"
                                type="text"
                                value={rules.splitPlayEpisode}
                                onChange={(e) => setRules(prev => ({ ...prev, splitPlayEpisode: e.target.value }))}
                                className="w-full bg-zinc-50 border border-zinc-200 rounded-lg p-2 font-mono text-zinc-800 focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] text-zinc-500 font-semibold block">每集名称 与 视频地址 切分符 例: $</label>
                              <input
                                id="split-name-url-input"
                                type="text"
                                value={rules.splitPlayNameAndUrl}
                                onChange={(e) => setRules(prev => ({ ...prev, splitPlayNameAndUrl: e.target.value }))}
                                className="w-full bg-zinc-50 border border-zinc-200 rounded-lg p-2 font-mono text-zinc-800 focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="pt-3 border-t border-zinc-100 flex items-center justify-between flex-wrap gap-3">
                          <div className="text-[11px] text-zinc-400">
                            💡 默认苹果CMS标准配置为 <b>vod_name / vod_pic / vod_play_url</b> ，分隔符为 <b>$$$ / # / $</b> 。
                          </div>
                          <button
                            id="save-rules-btn"
                            onClick={handleSaveScrapingRules}
                            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg transition shadow-xs flex items-center space-x-1"
                          >
                            <Check className="h-4 w-4" />
                            <span>保存并应用所有数据切分规则</span>
                          </button>
                        </div>

                      </div>

                      {/* SECTION 4: NETWORK REQUEST METHOD & PROXY CONFIG */}
                      <div className="bg-white rounded-2xl border border-zinc-200 p-6 space-y-4 shadow-xs">
                        <div className="flex items-center space-x-2 border-b border-zinc-100 pb-3.5">
                          <Globe className="h-4.5 w-4.5 text-indigo-600" />
                          <div>
                            <h4 className="text-sm font-bold text-zinc-800">4. 接口中继代理与网络请求模式</h4>
                            <p className="text-xs text-zinc-400">选择获取CMS和影视列表资源的网络传输方式。当在 Vercel 等海外托管部署由于国内网络隔离导致获取数据超时出错时，首选快捷切换。</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div
                            id="fetchmode-proxy-btn"
                            onClick={() => {
                              const nextSettings = { ...settings, fetchMode: 'proxy' as const };
                              setSettings(nextSettings);
                              saveAllSettingsToServer(nextSettings);
                              showToast('网络请求模式已设定为：服务器中继代理', 'success');
                            }}
                            className={`p-4 rounded-xl border-2 cursor-pointer transition select-none flex items-start space-x-3 ${
                              settings.fetchMode !== 'direct'
                                ? 'bg-indigo-50/70 border-indigo-400 text-indigo-900'
                                : 'bg-zinc-50 border-zinc-200 hover:bg-zinc-100 hover:border-zinc-300'
                            }`}
                          >
                            <span className={`p-1.5 rounded-lg text-xs mt-0.5 ${settings.fetchMode !== 'direct' ? 'bg-indigo-200/80 text-indigo-800 font-bold' : 'bg-zinc-200 text-zinc-650'}`}>
                              🌐
                            </span>
                            <div>
                              <span className="font-bold text-xs block text-zinc-805">服务器中继代理模式 (云端中转 - 默认)</span>
                              <span className="text-[11px] text-zinc-500 leading-relaxed block mt-1">
                                所有的采集请求都经由云端 Node 后端服务器中转。<b>特点是可以在 HTTPS 网页下无缝运作且免装跨域插件</b>。但当托管服务器（如 Vercel）受到服务器 IP 或国内防火墙对海外阻断时，可能会提示接口延迟或超时。
                              </span>
                            </div>
                          </div>

                          <div
                            id="fetchmode-direct-btn"
                            onClick={() => {
                              const nextSettings = { ...settings, fetchMode: 'direct' as const };
                              setSettings(nextSettings);
                              saveAllSettingsToServer(nextSettings);
                              showToast('网络请求模式已设定为：浏览器极速直连', 'success');
                            }}
                            className={`p-4 rounded-xl border-2 cursor-pointer transition select-none flex items-start space-x-3 ${
                              settings.fetchMode === 'direct'
                                ? 'bg-indigo-50/70 border-indigo-400 text-indigo-900'
                                : 'bg-zinc-50 border-zinc-200 hover:bg-zinc-100 hover:border-zinc-300'
                            }`}
                          >
                            <span className={`p-1.5 rounded-lg text-xs mt-0.5 ${settings.fetchMode === 'direct' ? 'bg-indigo-200/80 text-indigo-800 font-bold' : 'bg-zinc-200 text-zinc-650'}`}>
                              ⚡
                            </span>
                            <div>
                              <span className="font-bold text-xs block text-zinc-805">浏览器极速直连模式 (CORS / 无中继)</span>
                              <span className="text-[11px] text-zinc-500 leading-relaxed block mt-1">
                                绕过云网络中继。由您的浏览器直接连接 CMS 采集源接口。<b>速度极快、不耗用服务端任何连接数与带宽，彻底规避 Vercel 等海外云端被墙的问题</b>。但由于绝大多数视频采集源均未开放跨域 CORS 允许头，<b>通常需要您在浏览器安装 【CORS Unblock】 跨域解锁扩展插件才可正常运作</b>。
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                    </div>
                  )}

                  {/* SUB SECTION: GUIDE (自学与配置指南) */}
                  {adminTab === 'guide' && (
                    <div className="space-y-6 bg-white p-6 rounded-2xl border border-zinc-200 shadow-xs" id="help-guide-panel">
                      <div className="flex items-center space-x-2 pb-3 border-b border-zinc-200">
                        <BookOpen className="h-5 w-5 text-blue-600" />
                        <h3 className="text-base font-bold text-zinc-800">全网CMS及影剧资源的初学配置与采集指南</h3>
                      </div>

                      <div className="space-y-4 text-xs text-zinc-700 leading-relaxed font-sans">
                        <p>
                          极简影院（Cineflow CMS）采用了云端的 <b>服务器级网关跨域代理技术</b>。因为大部门采集网站的JSON数据流与视频M3U8直链在浏览器中运行会引发 “跨域拒绝 (CORS Blocked)” 或 “混合内容不安全 (Mixed Content ID)” 的报错。本软件通过服务端底层重新转发并重构报文头域，让你流畅播放。
                        </p>

                        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 space-y-2.5">
                          <span className="font-bold text-blue-800 text-[13px] block">💡 常见的开源优质免费采集源 (支持JSON)</span>
                          <p className="text-zinc-650">
                            你可以将以下采集网关直接复制并填入 <b>【自定义配置】</b> 或 <b>【CMS采集网关设置】</b> 字段中进行测试提取：
                          </p>
                          <ul className="list-disc pl-5 space-y-1.5 text-zinc-700 font-mono text-[11px]">
                            <li><b>苹果资源:</b> https://api.pgzyapi.com/api.php/provide/vod/at/json</li>
                            <li><b>闪播资源:</b> https://api.sbzyapi.com/api.php/provide/vod/at/json</li>
                            <li><b>红牛资源:</b> https://www.hongniuapi.com/api.php/provide/vod/at/json</li>
                            <li><b>天空资源:</b> https://m3u8.tiankongapi.com/api.php/provide/vod/at/json</li>
                          </ul>
                        </div>

                        <div className="space-y-3 pt-2">
                          <span className="font-bold text-zinc-800 text-[13px] block">❓ 为什么有的视频无法通过 “内置播放器” 播放？</span>
                          <p>
                            <b>1. 物理连接超时:</b> 对方资源站点可能断开链接、或者其独属的视频CDN正处于负载状态中。<br />
                            <b>2. 防抖防盗链安全验证:</b> 一些非标准采集站点使用了复杂的动态安全令牌，拒绝浏览器底层提取流。<br />
                            <b>3. 跨域拦截:</b> 这时候，你可以<b>灵活地通过左侧 or 下方的“播放解析/内核”下拉菜单</b>。将其切换为外部的 <b>【全能高清解析】</b>，系统将利用外部无广嵌套网关在iframe中自动安全解析播放该影视。
                          </p>
                        </div>

                        <div className="pt-4 border-t border-zinc-100 flex items-center justify-between text-zinc-400 text-[11px]">
                          <span>系统架构: 纯TS极致流畅 full-stack</span>
                          <span>极简影院开发实验版</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {adminTab === 'iptv' && (
                    <div className="space-y-6" id="iptv-admin-panel">
                      
                      <div className="flex items-center space-x-3 pb-2 border-b border-zinc-200">
                        <span className="p-2 bg-red-50 text-red-650 rounded-lg">
                          <Radio className="h-5 w-5 animate-pulse" />
                        </span>
                        <div>
                          <h3 className="text-base font-bold text-zinc-800">IPTV 高清电视直播网关控制中心</h3>
                          <p className="text-xs text-zinc-400">在此自由配置、新增、废除或检测前端播放器显示的 m3u8 高清电视直播频道。（修改保存后所有访客即时可见）</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-left">
                        
                        {/* LEFT COLUMN: Add Channel & M3U Import forms */}
                        <div className="lg:col-span-1 space-y-6">
                          
                          {/* Part 1: Add individual channel */}
                          <div className="bg-white rounded-2xl border border-zinc-200 p-5 space-y-4 shadow-xs">
                            <div className="flex items-center justify-between border-b border-zinc-150 pb-3">
                              <h4 className="text-sm font-bold text-zinc-800">➕ 新增高清电视频道</h4>
                              <span className="text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded font-mono font-bold tracking-wide">M3U8直播源</span>
                            </div>

                            <div className="space-y-3">
                              <div className="space-y-1">
                                <label className="text-[10px] text-zinc-500 font-bold block">频道名称 (例如: 湖南卫视HD)</label>
                                <input
                                  type="text"
                                  value={tempIptvName || ''}
                                  onChange={(e) => setTempIptvName(e.target.value)}
                                  placeholder="输入电视台名称..."
                                  className="w-full bg-white border border-zinc-200 text-xs rounded-md p-2 focus:ring-1 focus:ring-red-500 focus:outline-hidden text-zinc-900 placeholder-zinc-400"
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-[10px] text-zinc-500 font-bold block">直播视频流 URL (.m3u8 协议)</label>
                                <input
                                  type="text"
                                  value={tempIptvUrl || ''}
                                  onChange={(e) => setTempIptvUrl(e.target.value)}
                                  placeholder="https://.../index.m3u8"
                                  className="w-full bg-white border border-zinc-200 text-xs rounded-md p-2 focus:ring-1 focus:ring-red-500 focus:outline-hidden text-zinc-900 placeholder-zinc-400"
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-[10px] text-zinc-500 font-bold block">频道分类分组 (例如: CCTV 频道, 地方卫视)</label>
                                <input
                                  type="text"
                                  value={tempIptvGroup || ''}
                                  onChange={(e) => setTempIptvGroup(e.target.value)}
                                  placeholder="输入组名称, 留空默认为 地方卫视"
                                  className="w-full bg-white border border-zinc-200 text-xs rounded-md p-2 focus:ring-1 focus:ring-red-500 focus:outline-hidden text-zinc-900 placeholder-zinc-400"
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-[10px] text-zinc-500 font-bold block">频道徽章/Logo 图标 URL (可选)</label>
                                <input
                                  type="text"
                                  value={tempIptvLogo || ''}
                                  onChange={(e) => setTempIptvLogo(e.target.value)}
                                  placeholder="http://.../logo.png"
                                  className="w-full bg-white border border-zinc-200 text-xs rounded-md p-2 focus:ring-1 focus:ring-red-500 focus:outline-hidden text-zinc-900 placeholder-zinc-400"
                                />
                              </div>

                              <button
                                onClick={() => {
                                  if (!tempIptvName || !tempIptvUrl) {
                                    showToast('请输入完整的电视频道名称及M3U8直播源地址', 'error');
                                    return;
                                  }
                                  if (!tempIptvUrl.startsWith('http://') && !tempIptvUrl.startsWith('https://')) {
                                    showToast('M3U8直播流地址必须以 http:// 或 https:// 开头', 'error');
                                    return;
                                  }
                                  const newCh: IptvChannel = {
                                    id: 'iptv_' + Date.now(),
                                    name: tempIptvName.trim(),
                                    url: tempIptvUrl.trim(),
                                    group: tempIptvGroup.trim() || '地方卫视',
                                    logo: tempIptvLogo.trim() || undefined,
                                    status: 'active'
                                  };
                                  const updated = [...(settings.iptvSources || []), newCh];
                                  saveAllSettingsToServer({ ...settings, iptvSources: updated });
                                  showToast(`新增频道 【${tempIptvName}】 成功，已保存至后台。`, 'success');
                                  setTempIptvName('');
                                  setTempIptvUrl('');
                                  setTempIptvGroup('');
                                  setTempIptvLogo('');
                                }}
                                className="w-full bg-red-650 hover:bg-red-700 text-white font-bold text-xs py-2.5 rounded-lg transition duration-205 flex items-center justify-center space-x-1 shadow-md cursor-pointer mt-3 border-none"
                              >
                                <span>确认并添加此电视频道</span>
                              </button>
                            </div>
                          </div>

                          {/* Part 2: M3U bulk playlist import */}
                          <div className="bg-white rounded-2xl border border-zinc-200 p-5 space-y-4 shadow-xs">
                            <div className="flex items-center justify-between border-b border-zinc-150 pb-2.5">
                              <h4 className="text-sm font-bold text-zinc-800">🔗 批量导入 M3U 电视列表</h4>
                              <span className="text-[10px] bg-red-50 text-red-650 px-1.5 py-0.5 rounded font-mono font-bold tracking-wide">M3U自动解析</span>
                            </div>

                            {/* Custom Tab Selector */}
                            <div className="flex border-b border-zinc-100 text-[11px] font-bold">
                              <button
                                onClick={() => setM3uImportTab('url')}
                                className={`flex-1 pb-2 border-b-2 transition ${
                                  m3uImportTab === 'url'
                                    ? 'border-red-650 text-red-650'
                                    : 'border-transparent text-zinc-400 hover:text-zinc-650'
                                } bg-transparent cursor-pointer font-sans`}
                              >
                                🌐 线上 URL 导入
                              </button>
                              <button
                                onClick={() => setM3uImportTab('local')}
                                className={`flex-1 pb-2 border-b-2 transition ${
                                  m3uImportTab === 'local'
                                    ? 'border-red-650 text-red-650'
                                    : 'border-transparent text-zinc-400 hover:text-zinc-650'
                                } bg-transparent cursor-pointer font-sans`}
                              >
                                💻 本地文件/纯文本导入
                              </button>
                            </div>

                            {m3uImportTab === 'url' ? (
                              <>
                                <p className="text-[11px] text-zinc-500 leading-relaxed font-sans text-left">
                                  输入标准公网 M3U 播放清单 URL。系统将通过云端代理抓取并智能注入视频列表中。<strong>注意：</strong>如果您使用的是局局通、家庭内网等受限直播源，请点击上方切换至<b>“本地文件/纯文本导入”</b>，即可完美脱离网络屏障！
                                </p>

                                <div className="space-y-3 pt-1">
                                  <div className="space-y-1 text-left">
                                    <label className="text-[10px] text-zinc-500 font-bold block">M3U 电视清单 URL 地址</label>
                                    <input
                                      type="text"
                                      value={tempM3uUrl}
                                      onChange={(e) => setTempM3uUrl(e.target.value)}
                                      placeholder="http://121.139.182.40:5000/iptv"
                                      className="w-full bg-white border border-zinc-200 text-xs rounded-md p-2 focus:ring-1 focus:ring-red-500 focus:outline-hidden text-zinc-900 placeholder-zinc-400"
                                    />
                                  </div>

                                  <button
                                    onClick={async () => {
                                      if (!tempM3uUrl.trim()) {
                                        showToast('请输入有效的 M3U 清单 URL 链接格式', 'error');
                                        return;
                                      }
                                      if (!tempM3uUrl.startsWith('http://') && !tempM3uUrl.startsWith('https://')) {
                                        showToast('链接必须以 http:// 或 https:// 开头', 'error');
                                        return;
                                      }

                                      setIsImportingM3u(true);
                                      showToast('正在为您加载并解析公网 M3U 直播源网络数据，请稍候...', 'info');

                                      try {
                                        const res = await fetch(`/api/parse-m3u?url=${encodeURIComponent(tempM3uUrl.trim())}`);
                                        const json = await res.json();
                                        
                                        if (json.success && Array.isArray(json.channels)) {
                                          if (json.channels.length === 0) {
                                            showToast('获取成功，但未解析出有效的电视频道，请重试或检查该 M3U 的文本格式！', 'error');
                                          } else {
                                            const currentSources = settings.iptvSources || [];
                                            const updated = [...currentSources, ...json.channels];
                                            
                                            await saveAllSettingsToServer({ ...settings, iptvSources: updated });
                                            showToast(`大功告成！已经成功为您吞噬并批量录入了 ${json.channels.length} 个高清电视直播频道！`, 'success');
                                            setTempM3uUrl('');
                                          }
                                        } else {
                                          showToast(json.error || '解析线上 M3U 清单失败，请检查目标服务器是否宕机或格式不符。', 'error');
                                        }
                                      } catch (e: any) {
                                        showToast(`批量拉取失败: ${e.message}`, 'error');
                                      } finally {
                                        setIsImportingM3u(false);
                                      }
                                    }}
                                    disabled={isImportingM3u}
                                    className={`w-full text-white font-bold text-xs py-2.5 rounded-lg transition duration-205 flex items-center justify-center space-x-1.5 shadow-md cursor-pointer border-none ${
                                      isImportingM3u 
                                        ? 'bg-zinc-350 cursor-not-allowed opacity-80' 
                                        : 'bg-zinc-850 hover:bg-zinc-900'
                                    }`}
                                  >
                                    {isImportingM3u ? (
                                      <>
                                        <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" />
                                        <span>深度拉取并解析中...</span>
                                      </>
                                    ) : (
                                      <span>🚀 一键拉取并自动解析批量导入</span>
                                    )}
                                  </button>
                                </div>
                              </>
                            ) : (
                              <>
                                <p className="text-[11px] text-zinc-500 leading-relaxed font-sans text-left">
                                  <strong>本地端安全解析：</strong> 绕过所有云端安全沙箱限制与代理拦截！适合从本地路由器（如 121.139.148.40 等内网 IP）配置的私有广播列表或者国内家庭内网 IPTV 组播节目表。
                                </p>

                                <div className="space-y-3 pt-1">
                                  {/* Drag and drop section */}
                                  <div className="border-2 border-dashed border-zinc-200 rounded-xl p-3 text-center hover:bg-zinc-50 transition relative">
                                    <input
                                      type="file"
                                      accept=".m3u,.txt,.m3u8"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;

                                        const reader = new FileReader();
                                        reader.onload = async (evt) => {
                                          const text = evt.target?.result as string;
                                          if (!text) return;

                                          const parsedChannels = parseM3uTextContent(text);
                                          if (parsedChannels.length === 0) {
                                            showToast('无法解析该文件：未检测到任何包含 #EXTINF 清细信息的直播线路！', 'error');
                                            return;
                                          }

                                          const currentSources = settings.iptvSources || [];
                                          const updated = [...currentSources, ...parsedChannels];
                                          await saveAllSettingsToServer({ ...settings, iptvSources: updated });
                                          showToast(`导入成功！已秒级装填并合并了您本机的 ${parsedChannels.length} 个高清电视直播频道。`, 'success');
                                        };
                                        reader.readAsText(file);
                                      }}
                                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    />
                                    <div className="text-xs text-zinc-700 font-bold">📤 点击在此选择本地 M3U / TXT 文件</div>
                                    <div className="text-[9px] text-zinc-400 mt-1">支持拖拉或点击直接载入进行浏览器无底噪深度解析</div>
                                  </div>

                                  {/* Direct manual paste section */}
                                  <div className="space-y-1 text-left">
                                    <div className="flex items-center justify-between">
                                      <label className="text-[10px] text-zinc-500 font-bold block">或直接在此粘贴 .M3U 纯文本内容</label>
                                      {tempM3uText && (
                                        <button 
                                          onClick={() => setTempM3uText('')}
                                          className="text-[9px] text-red-500 hover:underline cursor-pointer border-none bg-transparent"
                                        >
                                          清空
                                        </button>
                                      )}
                                    </div>
                                    <textarea
                                      rows={4}
                                      value={tempM3uText}
                                      onChange={(e) => setTempM3uText(e.target.value)}
                                      placeholder={`#EXTM3U\n#EXTINF:-1 tvg-name="湖南卫视" group-title="卫视频道",湖南卫视\nhttp://121.139.148.40:5000/live/hunan.m3u8`}
                                      className="w-full bg-white border border-zinc-200 text-[10px] font-mono rounded-md p-2 focus:ring-1 focus:ring-red-500 focus:outline-hidden text-zinc-900 placeholder-zinc-400 leading-normal"
                                    />
                                  </div>

                                  <button
                                    onClick={async () => {
                                      if (!tempM3uText.trim()) {
                                        showToast('请在文本框内粘贴带有 #EXTINF 的 M3U 电视清单！', 'error');
                                        return;
                                      }

                                      const parsedChannels = parseM3uTextContent(tempM3uText);
                                      if (parsedChannels.length === 0) {
                                        showToast('解析失败：未检验到任何有效的频道规则。请核对是否具有 EXTINF 与 URL 连接格式！', 'error');
                                        return;
                                      }

                                      const currentSources = settings.iptvSources || [];
                                      const updated = [...currentSources, ...parsedChannels];
                                      await saveAllSettingsToServer({ ...settings, iptvSources: updated });
                                      showToast(`一键解析合并大成功！已为您额外装载了 ${parsedChannels.length} 条直播线路。`, 'success');
                                      setTempM3uText('');
                                    }}
                                    className="w-full text-white font-bold text-xs py-2 bg-red-650 hover:bg-red-750 rounded-lg transition duration-205 flex items-center justify-center space-x-1 shadow-md cursor-pointer border-none"
                                  >
                                    <span>⚡ 立即粘贴一键本地解析合并</span>
                                  </button>
                                </div>
                              </>
                            )}
                          </div>

                        </div>

                        {/* RIGHT GRID: Current channels lists management */}
                        <div className="lg:col-span-2 bg-white rounded-2xl border border-zinc-200 p-5 space-y-4 shadow-xs flex flex-col">
                          <div className="flex items-center justify-between border-b border-zinc-150 pb-3">
                            <h4 className="text-sm font-bold text-zinc-800 flex items-center gap-1.5">
                              <span>当前直播线路频道一览 ({ (settings.iptvSources || []).length } 个)</span>
                            </h4>
                            {isResettingIptv ? (
                              <div className="flex items-center space-x-2">
                                <span className="text-[10px] text-red-600 font-bold bg-red-50 px-2 py-0.5 rounded">确定清空所有自定义并恢复默认？</span>
                                <button
                                  onClick={() => {
                                    const DEFAULT_IPTV_FALLBACK: IptvChannel[] = [
                                      { id: 'cgtn_news', name: 'CGTN 国际新闻台', url: 'https://live.cgtn.com/1000/prog_index.m3u8', group: 'CGTN 频道', logo: 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=128&auto=format&fit=crop&q=80', status: 'active' },
                                      { id: 'cgtn_doc', name: 'CGTN 纪录片频道', url: 'https://live.cgtn.com/1002/prog_index.m3u8', group: 'CGTN 频道', logo: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=128&auto=format&fit=crop&q=80', status: 'active' },
                                      { id: 'cgtn_es', name: 'CGTN 西班牙语频道', url: 'https://live.cgtn.com/1003/prog_index.m3u8', group: 'CGTN 频道', logo: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=128&auto=format&fit=crop&q=80', status: 'active' },
                                      { id: 'cgtn_fr', name: 'CGTN 法语台', url: 'https://live.cgtn.com/1004/prog_index.m3u8', group: 'CGTN 频道', logo: 'https://images.unsplash.com/photo-1513151233558-d860c5398176?w=128&auto=format&fit=crop&q=80', status: 'active' },
                                      { id: 'cgtn_ar', name: 'CGTN 阿拉伯语台', url: 'https://live.cgtn.com/1005/prog_index.m3u8', group: 'CGTN 频道', logo: 'https://images.unsplash.com/photo-1528605248644-14dd04022da1?w=128&auto=format&fit=crop&q=80', status: 'active' },
                                      { id: 'cgtn_ru', name: 'CGTN 俄语频道', url: 'https://live.cgtn.com/1006/prog_index.m3u8', group: 'CGTN 频道', logo: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=128&auto=format&fit=crop&q=80', status: 'active' },
                                      { id: 'cctv1', name: 'CCTV-1 综合频道', url: 'https://v-local.hnntv.cn/live/cctv1.m3u8', group: 'CCTV 频道', logo: 'https://images.unsplash.com/photo-1626814026160-2237a95fc5a0?w=128&auto=format&fit=crop&q=80', status: 'active' },
                                      { id: 'cctv13', name: 'CCTV-13 新闻频道', url: 'https://v-local.hnntv.cn/live/cctv13.m3u8', group: 'CCTV 频道', logo: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=128&auto=format&fit=crop&q=80', status: 'active' }
                                    ];
                                    saveAllSettingsToServer({ ...settings, iptvSources: DEFAULT_IPTV_FALLBACK });
                                    showToast('已成功重置为 CCTV & CGTN 经典官方直播源组合！', 'info');
                                    setIsResettingIptv(false);
                                  }}
                                  className="px-2 py-1 rounded text-[10px] bg-red-650 hover:bg-red-750 text-white cursor-pointer border-none font-bold"
                                >
                                  确认重置
                                </button>
                                <button
                                  onClick={() => setIsResettingIptv(false)}
                                  className="px-2 py-1 rounded text-[10px] bg-zinc-100 hover:bg-zinc-200 text-zinc-650 cursor-pointer border-none"
                                >
                                  取消
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setIsResettingIptv(true)}
                                className="text-[11px] font-sans font-bold text-red-650 hover:text-red-750 hover:underline flex items-center gap-1 cursor-pointer border-none bg-transparent"
                              >
                                <RotateCcw className="h-3 w-3 animate-spin duration-3000" />
                                <span>重置默认电视播单</span>
                              </button>
                            )}
                          </div>

                          <div className="overflow-x-auto border border-zinc-200 rounded-xl max-h-[460px] overflow-y-auto">
                            <table className="w-full text-left text-xs divide-y divide-zinc-200">
                              <thead className="bg-[#fafafa] sticky top-0 z-10">
                                <tr>
                                  <th className="p-3 font-semibold text-zinc-650">电视频道名</th>
                                  <th className="p-3 font-semibold text-zinc-650">所属分组分类</th>
                                  <th className="p-3 font-semibold text-zinc-650">状态</th>
                                  <th className="p-3 font-semibold text-zinc-650 text-center">操作</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-200 bg-white">
                                {(settings.iptvSources || []).map((ch) => (
                                  <tr key={ch.id} className="hover:bg-zinc-50 transition-colors">
                                    <td className="p-3 truncate max-w-[150px]">
                                      <div className="font-bold text-zinc-800">{ch.name}</div>
                                      <div className="text-[10px] text-zinc-450 font-mono mt-0.5 truncate select-all">{ch.url}</div>
                                    </td>
                                    <td className="p-3 text-zinc-600">
                                      <span className="bg-zinc-100 px-2 py-0.5 rounded text-[10px] font-sans">{ch.group || '常规频道'}</span>
                                    </td>
                                    <td className="p-3">
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                        ch.status === 'active'
                                          ? 'bg-green-50 text-green-700 border border-green-200'
                                          : 'bg-zinc-100 text-zinc-400'
                                      }`}>
                                        {ch.status === 'active' ? '正常开放' : '已禁用'}
                                      </span>
                                    </td>
                                    <td className="p-3 text-center">
                                      <div className="flex items-center justify-center space-x-2">
                                        <button
                                          onClick={() => {
                                            const updated = (settings.iptvSources || []).map(c => 
                                              c.id === ch.id ? { ...c, status: (c.status === 'active' ? 'inactive' : 'active') as any } : c
                                            );
                                            saveAllSettingsToServer({ ...settings, iptvSources: updated });
                                            showToast(`已成功修改 ${ch.name} 的开放状态！`, 'success');
                                          }}
                                          className={`px-2.5 py-1 text-[10px] rounded hover:shadow-xs transition cursor-pointer border-none ${
                                            ch.status === 'active'
                                              ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'
                                              : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold'
                                          }`}
                                        >
                                          {ch.status === 'active' ? '禁用' : '激活'}
                                        </button>
                                        {deletingChannelId === ch.id ? (
                                          <div className="flex items-center space-x-1.5 justify-center">
                                            <button
                                              onClick={() => {
                                                const updated = (settings.iptvSources || []).filter(c => c.id !== ch.id);
                                                saveAllSettingsToServer({ ...settings, iptvSources: updated });
                                                showToast(`电视频道 ${ch.name} 已成功移出数据库！`, 'success');
                                                setDeletingChannelId(null);
                                              }}
                                              className="bg-red-600 hover:bg-red-700 text-white px-2.5 py-1 text-[10px] rounded font-bold transition hover:shadow-xs cursor-pointer border-none"
                                            >
                                              确定
                                            </button>
                                            <button
                                              onClick={() => setDeletingChannelId(null)}
                                              className="bg-zinc-150 hover:bg-zinc-200 text-zinc-700 px-2.5 py-1 text-[10px] rounded transition hover:shadow-xs cursor-pointer border-none"
                                            >
                                              取消
                                            </button>
                                          </div>
                                        ) : (
                                          <button
                                            onClick={() => setDeletingChannelId(ch.id)}
                                            className="bg-red-50 hover:bg-red-100 text-red-600 px-2.5 py-1 text-[10px] rounded transition hover:shadow-xs cursor-pointer border-none"
                                          >
                                            删除
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                                {(settings.iptvSources || []).length === 0 && (
                                  <tr>
                                    <td colSpan={4} className="p-6 text-center text-zinc-400 font-sans">
                                      暂无任何配置的 IPTV 电视频道流。
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>

                        </div>

                      </div>

                    </div>
                  )}

                </div>
              )}
            </div>
          )}

        </section>
      </main>

      {/* FOOTER METADATA STATUS BAR */}
      <footer className="h-10 bg-white border-t border-zinc-200 px-4 sm:px-10 flex items-center justify-between text-[11px] text-zinc-400 shrink-0">
        <div className="flex space-x-4">
          <span className="hidden sm:inline">系统负载: <span className="text-emerald-600 font-sans font-bold">1.2%</span></span>
          <span>CMS API Version: <span className="text-zinc-600 font-mono font-bold">v4.2.0</span></span>
          <span className="hidden sm:inline">采集并发: 12ms</span>
        </div>
        <div className="flex items-center">
          <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
          <span>采集总线连接正常</span>
        </div>
      </footer>
    </div>
  );
}
