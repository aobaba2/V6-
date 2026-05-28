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
      url: 'https://collect.wlzy.co/api.php/provide/vod/at/json',
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
  selectedParserId: 'internal' // 'internal' represents using the browser's Hls.js player
};

const app = express();
const PORT = 3000;
const DATA_DIR = path.join(process.cwd(), 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// Ensure data folder exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
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
          if (source.url.includes('wlzyapi.com') || source.url.includes('cj.wlzyapi.com')) {
            source.url = 'https://collect.wlzy.co/api.php/provide/vod/at/json';
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

      if (modified) {
        console.log('[Self-Healing Migration] Upgraded stale settings targets seamlessly.');
        saveSettings(settings);
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

start();
