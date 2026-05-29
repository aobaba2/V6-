import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { AppSettings } from './src/types.js';

// Setup default settings in case config file is not found
const DEFAULT_SETTINGS: AppSettings = {
  cmsSources: [
    {
      id: 'ffzy',
      name: '飞速高清 (飞速极速)',
      url: 'https://api.ffzyapi.com/api.php/provide/vod/at/json',
      status: 'active'
    },
    {
      id: 'bdzy',
      name: '极速影音 (百度秒播)',
      url: 'https://api.apibdzy.com/api.php/provide/vod/at/json',
      status: 'active'
    },
    {
      id: 'hhzy',
      name: '豪华资源 (豪华极速)',
      url: 'https://hhzyapi.com/api.php/provide/vod/at/json',
      status: 'active'
    },
    {
      id: 'bfzy',
      name: '暴风资源 (经典多源)',
      url: 'https://bfzyapi.com/api.php/provide/vod/at/json',
      status: 'active'
    },
    {
      id: 'wlzy',
      name: '卧龙资源 (高速M3U8)',
      url: 'https://api.wolongapi.com/api.php/provide/vod/at/json',
      status: 'active'
    }
  ],
  m3u8Parsers: [
    {
      id: 'xmflv',
      name: '全能高清解析 (网页嵌套)',
      url: 'https://jx.xmflv.cc/?url=',
      type: 'iframe',
      status: 'active'
    },
    {
      id: 'jsonplayer',
      name: '极速无广解析',
      url: 'https://jx.jsonplayer.com/player/?url=',
      type: 'iframe',
      status: 'active'
    },
    {
      id: 'aidouer',
      name: '虾米解析',
      url: 'https://jx.aidouer.net/?url=',
      type: 'iframe',
      status: 'active'
    }
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
  selectedParserId: 'internal', // 'internal' represents using the browser's Hls.js player
  iptvSources: [
    { id: 'cgtn_news', name: 'CGTN 国际新闻台', url: 'https://live.cgtn.com/1000/prog_index.m3u8', group: 'CGTN 频道', logo: 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=128&auto=format&fit=crop&q=80', status: 'active' },
    { id: 'cgtn_doc', name: 'CGTN 纪录片频道', url: 'https://live.cgtn.com/1002/prog_index.m3u8', group: 'CGTN 频道', logo: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=128&auto=format&fit=crop&q=80', status: 'active' },
    { id: 'cgtn_es', name: 'CGTN 西班牙语频道', url: 'https://live.cgtn.com/1003/prog_index.m3u8', group: 'CGTN 频道', logo: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=128&auto=format&fit=crop&q=80', status: 'active' },
    { id: 'cgtn_fr', name: 'CGTN 法语台', url: 'https://live.cgtn.com/1004/prog_index.m3u8', group: 'CGTN 频道', logo: 'https://images.unsplash.com/photo-1513151233558-d860c5398176?w=128&auto=format&fit=crop&q=80', status: 'active' },
    { id: 'cgtn_ar', name: 'CGTN 阿拉伯语台', url: 'https://live.cgtn.com/1005/prog_index.m3u8', group: 'CGTN 频道', logo: 'https://images.unsplash.com/photo-1528605248644-14dd04022da1?w=128&auto=format&fit=crop&q=80', status: 'active' },
    { id: 'cgtn_ru', name: 'CGTN 俄语频道', url: 'https://live.cgtn.com/1006/prog_index.m3u8', group: 'CGTN 频道', logo: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=128&auto=format&fit=crop&q=80', status: 'active' },
    { id: 'cctv1', name: 'CCTV-1 综合频道', url: 'https://v-local.hnntv.cn/live/cctv1.m3u8', group: 'CCTV 频道', logo: 'https://images.unsplash.com/photo-1626814026160-2237a95fc5a0?w=128&auto=format&fit=crop&q=80', status: 'active' },
    { id: 'cctv13', name: 'CCTV-13 新闻频道', url: 'https://v-local.hnntv.cn/live/cctv13.m3u8', group: 'CCTV 频道', logo: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=128&auto=format&fit=crop&q=80', status: 'active' }
  ]
};

const app = express();
const PORT = 3000;
const DEFAULT_SETTINGS_FILE = path.join(process.cwd(), 'data', 'settings.json');
const DATA_DIR = process.env.VERCEL ? '/tmp' : path.join(process.cwd(), 'data');
const SETTINGS_FILE = process.env.VERCEL ? '/tmp/settings.json' : path.join(DATA_DIR, 'settings.json');

// Ensure data folder exists
if (!process.env.VERCEL) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// Get or initialize settings
function getSettings(): AppSettings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      const settings = JSON.parse(data) as AppSettings;
      
      // Self-heating hotfix migration for outdated cached fields
      let modified = false;

      // 1. If old default selectedCmsId was 'wlzy' (pointing to dead link on first run), switch to stable 'ffzy'
      if (settings.selectedCmsId === 'wlzy') {
        settings.selectedCmsId = 'ffzy';
        modified = true;
      }

      // 2. Scan and replace any legacy dead domains in cmsSources
      if (Array.isArray(settings.cmsSources)) {
        settings.cmsSources = settings.cmsSources.map(source => {
          if (source.url.includes('wlzy.co') || source.url.includes('collect.wlzy.co') || source.url.includes('cj.wlzyapi.com')) {
            source.url = 'https://api.wolongapi.com/api.php/provide/vod/at/json';
            modified = true;
          }
          return source;
        });

        // 3. Ensure 'ffzy' exists in sources list
        const hasFfzy = settings.cmsSources.some(s => s.id === 'ffzy' || s.url.includes('ffzyapi.com'));
        if (!hasFfzy) {
          settings.cmsSources.unshift({
            id: 'ffzy',
            name: '飞速高清 (飞速极速)',
            url: 'https://api.ffzyapi.com/api.php/provide/vod/at/json',
            status: 'active'
          });
          modified = true;
        }

        // 4. Ensure 'hhzy' exists
        const hasHhzy = settings.cmsSources.some(s => s.id === 'hhzy' || s.url.includes('hhzyapi.com'));
        if (!hasHhzy) {
          settings.cmsSources.push({
            id: 'hhzy',
            name: '豪华资源 (豪华极速)',
            url: 'https://hhzyapi.com/api.php/provide/vod/at/json',
            status: 'active'
          });
          modified = true;
        }
      }

      // 5. Ensure iptvSources exists and has fallback values if empty
      if (!settings.iptvSources || !Array.isArray(settings.iptvSources) || settings.iptvSources.length === 0) {
        settings.iptvSources = DEFAULT_SETTINGS.iptvSources;
        modified = true;
      }

      if (modified) {
        console.log('[Self-Healing Migration] Upgraded stale settings targets seamlessly.');
        saveSettings(settings);
      }

      return settings;
    } else if (process.env.VERCEL && fs.existsSync(DEFAULT_SETTINGS_FILE)) {
      // Warm up /tmp/settings.json with pre-baked seed settings on Vercel initialization
      const data = fs.readFileSync(DEFAULT_SETTINGS_FILE, 'utf-8');
      const settings = JSON.parse(data) as AppSettings;
      try {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
      } catch (writeErr) {
        console.error('Error writing seed settings to /tmp/settings.json:', writeErr);
      }
      return settings;
    }
  } catch (err) {
    console.error('Error loading settings, using defaults:', err);
  }
  // Write default settings
  saveSettings(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

function saveSettings(settings: AppSettings) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving settings to disk:', err);
  }
}

app.use(express.json());

// API: Get app settings
app.get('/api/settings', (req, res) => {
  const settings = getSettings();
  res.json(settings);
});

// API: Update app settings
app.post('/api/settings', (req, res) => {
  try {
    const newSettings = req.body as AppSettings;
    if (!newSettings || typeof newSettings !== 'object') {
       res.status(400).json({ error: 'Invalid settings format' });
       return;
    }
    saveSettings(newSettings);
    res.json({ success: true, settings: newSettings });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API: CMS memory cache dictionary to protect against 429 rate limit triggers of free public providers
interface CacheItem {
  data: any;
  statusCode: number;
  contentType: string;
  expiresAt: number;
}
const proxyCache = new Map<string, CacheItem>();

// Prune expired cache entries every 60s
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of proxyCache.entries()) {
    if (now > entry.expiresAt) {
      proxyCache.delete(key);
    }
  }
}, 60000);

// API: CMS resource getter proxy
app.get('/api/cms-proxy', async (req, res) => {
  const { url, ac, pg, t, wd, ids, refresh } = req.query;

  if (!url) {
    res.status(400).json({ error: 'Missing CMS active URL' });
    return;
  }

  // Generate a distinct stable cache key
  const cacheKey = `${url || ''}_ac:${ac || ''}_pg:${pg || ''}_t:${t || ''}_wd:${wd || ''}_ids:${ids || ''}`;
  const now = Date.now();

  const isForceRefresh = refresh === 'true';

  if (!isForceRefresh) {
    const cached = proxyCache.get(cacheKey);
    if (cached && now < cached.expiresAt) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('Content-Type', cached.contentType);
      res.status(cached.statusCode).send(cached.data);
      return;
    }
  }

  try {
    const targetUrl = new URL(url as string);

    // Append query parameters to target URL
    if (ac) targetUrl.searchParams.set('ac', ac as string);
    if (pg) targetUrl.searchParams.set('pg', pg as string);
    if (t) targetUrl.searchParams.set('t', t as string);
    if (wd) targetUrl.searchParams.set('wd', wd as string);
    if (ids) targetUrl.searchParams.set('ids', ids as string);

    console.log(`[CMS Proxy] Fetching: ${targetUrl.toString()}${isForceRefresh ? ' (Bypassing Cache)' : ''}`);

    const response = await fetch(targetUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
      },
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    if (!response.ok) {
       res.status(response.status).json({ error: `Received non-ok response ${response.status} from CMS` });
       return;
    }

    const contentType = response.headers.get('content-type') || 'application/json';
    const textData = await response.text();

    // Check if response is actually JSON or maybe XML (some providers default to XML if not specified)
    if (textData.trim().startsWith('<')) {
       res.status(422).json({ error: 'Endpoint returned XML. This site supports JSON API only.' });
       return;
    }

    try {
      const jsonData = JSON.parse(textData);
      
      // Determine caching strategy TTL:
      // Category / Class list queries (ac parameter is not list or videolist, e.g. empty general query) change almost never. Cache for 5 mins.
      // Active video grids (page or category results or search keys) can cache for 45s to avoid double-clicking 429 and high load.
      const isClassQuery = !ac || (ac !== 'list' && ac !== 'videolist');
      const ttl = isClassQuery ? (5 * 60 * 1000) : 45000; // 5 min vs 45s
      
      proxyCache.set(cacheKey, {
        data: textData,
        statusCode: 200,
        contentType: 'application/json; charset=utf-8',
        expiresAt: now + ttl
      });

      res.setHeader('X-Cache', 'MISS');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.json(jsonData);
    } catch {
      res.status(500).json({ error: 'Failed to parse JSON response from the CMS provider.' });
    }
  } catch (err: any) {
    console.error('[CMS Proxy Rule Error]', err);
    res.status(500).json({ error: `Connection failed: ${err.message}` });
  }
});

// API: Stream proxy for HTTP streams to play securely on HTTPS and bypass CORS issues
app.get('/api/stream-proxy', async (req, res) => {
  const { url } = req.query;
  if (!url || typeof url !== 'string') {
    res.status(400).send('Missing url parameters');
    return;
  }

  try {
    const targetUrl = new URL(url);
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
    };

    console.log(`[Stream Proxy] Requesting target stream: ${targetUrl.toString()}`);

    const response = await fetch(targetUrl.toString(), {
      headers,
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      res.status(response.status).send(`Failed fetching target URL: ${response.statusText}`);
      return;
    }

    const contentType = response.headers.get('content-type') || '';
    const isM3U8 = url.includes('.m3u8') || 
                   contentType.includes('mpegurl') || 
                   contentType.includes('mpegURL') ||
                   contentType.includes('application/x-mpegurl') ||
                   contentType.includes('application/vnd.apple.mpegurl');

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (isM3U8) {
      // Direct playlist manifest: Parse and rewrite sub-segments
      const playlistText = await response.text();
      const lines = playlistText.split(/\r?\n/);
      const baseUrl = targetUrl.origin + targetUrl.pathname.substring(0, targetUrl.pathname.lastIndexOf('/') + 1);

      const rewrittenLines = lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed) return line;

        let processedLine = line;
        
        // 1. Resolve AES keys URI: #EXT-X-KEY:METHOD=AES-128,URI="segment.key"
        if (trimmed.startsWith('#')) {
          const uriMatches = trimmed.match(/URI=["']([^"']+)["']/i);
          if (uriMatches && uriMatches[1]) {
            const relativeUri = uriMatches[1];
            let absoluteUri = relativeUri;
            if (!relativeUri.startsWith('http://') && !relativeUri.startsWith('https://')) {
              try {
                absoluteUri = new URL(relativeUri, baseUrl).toString();
              } catch {}
            }
            const proxiedUri = `/api/stream-proxy?url=${encodeURIComponent(absoluteUri)}`;
            processedLine = line.replace(relativeUri, proxiedUri);
          }
          return processedLine;
        }

        // 2. Resolve normal media chunks URLs (.ts segments)
        let absoluteUrl = trimmed;
        if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
          try {
            absoluteUrl = new URL(trimmed, baseUrl).toString();
          } catch {}
        }

        // Return path prefix proxy wrapper
        return `/api/stream-proxy?url=${encodeURIComponent(absoluteUrl)}`;
      });

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.send(rewrittenLines.join('\n'));
    } else {
      // Binary content media chunk (TS chunk, MP4, raw video, etc.): Pipe stream directly
      res.setHeader('Content-Type', contentType || 'video/mp2t');
      
      if (response.body) {
        const reader = response.body.getReader();
        const pump = async () => {
          try {
            const { done, value } = await reader.read();
            if (done) {
              res.end();
              return;
            }
            res.write(value);
            await pump();
          } catch {
            res.end();
          }
        };
        await pump();
      } else {
        const buffer = await response.arrayBuffer();
        res.send(Buffer.from(buffer));
      }
    }
  } catch (err: any) {
    console.error('[Stream Proxy Error]', err);
    res.status(500).send(`Stream Proxy failed: ${err.message}`);
  }
});

// API: Parse custom uploaded or online m3u playlist file for batch imports
app.get('/api/parse-m3u', async (req, res) => {
  const { url } = req.query;
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'Missing url parameters' });
    return;
  }

  try {
    const targetUrl = new URL(url);
    console.log(`[M3U Parser] Loading file list from: ${targetUrl.toString()}`);

    const response = await fetch(targetUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
       res.status(response.status).json({ error: `无法获取该M3U文件: ${response.statusText}` });
       return;
    }

    const text = await response.text();
    const lines = text.split(/\r?\n/);
    const channels: any[] = [];
    
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
        let resolvedUrl = line;
        if (!line.startsWith('http://') && !line.startsWith('https://')) {
          try {
            resolvedUrl = new URL(line, targetUrl).toString();
          } catch {}
        }
        currentChannel.url = resolvedUrl;
        currentChannel.id = 'iptv_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
        
        if (currentChannel.name && currentChannel.url) {
          channels.push(currentChannel);
        }
        currentChannel = null;
      }
    }

    res.json({ success: true, count: channels.length, channels });
  } catch (err: any) {
    console.error('[M3U Parser Error]', err);
    let errorDetail = err.message || '';
    if (err.cause && err.cause.message) {
      errorDetail += ` (${err.cause.message})`;
    }
    const isTimeout = errorDetail.toLowerCase().includes('timeout') || 
                      err.code === 'UND_ERR_CONNECT_TIMEOUT' || 
                      err.name === 'TimeoutError';
    
    if (isTimeout) {
      res.status(504).json({ 
        error: '获取直播源发生【连接超时】。该 M3U 直播源地址可能由于本地内网限制、目标端口未向外公开（例如 5000 端口仅可内网访问）、或防盗链策略，导致云端后台服务器无法直接触达。您可以点击并切换到旁边的【本地文件/纯文本导入】选项，在您的浏览器端直接完成秒级解析与安全导入！' 
      });
    } else {
      res.status(500).json({ 
        error: `批量拉取失败: ${errorDetail}。如果是您本地路由演练服务，请使用旁边的【本地文件/纯文本导入】即可绕过服务器限制，完成本地无缝装载。` 
      });
    }
  }
});

// Serve frontend application assets
async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  start();
}

export default app;
