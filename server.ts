import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import http from 'http';
import https from 'https';
import dns from 'dns';
import urlModule from 'url';
import zlib from 'zlib';
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
      url: 'https://api.wlzyapi.com/api.php/provide/vod/at/json',
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
  fetchMode: 'proxy',
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
const SETTINGS_FILE = process.env.VERCEL ? '/tmp/settings.json' : path.join(DATA_DIR, 'settings_user.json');

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
          if (
            source.url.includes('wlzy.co') || 
            source.url.includes('collect.wlzy.co') || 
            source.url.includes('cj.wlzyapi.com') || 
            source.url.includes('wolongapi.com') || 
            source.url.includes('api.wolongapi.com')
          ) {
            source.url = 'https://api.wlzyapi.com/api.php/provide/vod/at/json';
            modified = true;
          }
          return source;
        });
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
    } else {
      // SETTINGS_FILE (settings_user.json) does not exist! Try to seed it from DEFAULT_SETTINGS_FILE (data/settings.json)
      const seedFile = path.join(process.cwd(), 'data', 'settings.json');
      if (fs.existsSync(seedFile)) {
        console.log('[Settings Initializer] Seeding settings_user.json from original settings.json...');
        try {
          const data = fs.readFileSync(seedFile, 'utf-8');
          const settings = JSON.parse(data) as AppSettings;
          saveSettings(settings); // write to settings_user.json
          return settings;
        } catch (err) {
          console.error('Error reading the seed default settings.json file:', err);
        }
      }
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

// Helper to convert any custom/Unicode/Chinese URLs into standards-compliant URLs (Punycode domains + URL-encoded paths)
function toCompliantUrl(urlStr: string): string {
  let u = urlStr.trim();
  if (!u.startsWith('http://') && !u.startsWith('https://')) {
    u = 'http://' + u;
  }
  // Optimization: If the URL is purely standard ASCII, return it completely untouched
  // to avoid any potential side effects like double URL encoding on nested query parameters.
  if (!/[^\x00-\x7F]/.test(u)) {
    return u;
  }
  try {
    const tempUrl = new URL(u);
    let hostnameStr = tempUrl.hostname;
    // Direct Unicode checking, convert to Punycode/ASCII if contains Unicode
    if (/[^\x00-\x7F]/.test(hostnameStr)) {
      hostnameStr = urlModule.domainToASCII(hostnameStr);
    }
    
    // Path block encoding
    let pathnameStr = tempUrl.pathname.split('/').map(segment => {
      if (/[^\x00-\x7F]/.test(segment)) {
        try {
          return encodeURIComponent(decodeURIComponent(segment));
        } catch {
          return encodeURIComponent(segment);
        }
      }
      return segment;
    }).join('/');
    
    // Reconstruct query parameters safely only if query parameters have non-ASCII
    let searchStr = tempUrl.search;
    if (searchStr && searchStr.length > 1 && /[^\x00-\x7F]/.test(searchStr)) {
      const searchParams = new URLSearchParams(searchStr);
      const encodedParams = new URLSearchParams();
      searchParams.forEach((val, key) => {
        encodedParams.set(key, val);
      });
      searchStr = '?' + encodedParams.toString();
    }
    
    const finalUrl = `${tempUrl.protocol}//${hostnameStr}${tempUrl.port ? ':' + tempUrl.port : ''}${pathnameStr}${searchStr}${tempUrl.hash}`;
    return finalUrl;
  } catch (err) {
    console.warn('[toCompliantUrl] Normalization failed, fallback to encodeURI:', err);
    try {
      return encodeURI(u);
    } catch {
      return u;
    }
  }
}

// Helper to filter out intranet, loopback and private IP space queries (including localhost)
function isPrivateUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.startsWith('127.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.16.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
      hostname.endsWith('.local') ||
      hostname === '::1'
    ) {
      return true;
    }
    return false;
  } catch {
    return true; // Block invalid URLs
  }
}

// API: CMS resource getter proxy
app.get('/api/cms-proxy', async (req, res) => {
  const { url, ac, pg, t, wd, ids, refresh } = req.query;

  if (!url) {
    res.status(400).json({ error: 'Missing CMS active URL' });
    return;
  }

  const compliantUrl = toCompliantUrl(url as string);

  if (isPrivateUrl(compliantUrl)) {
    res.status(400).json({ error: '安全检测未通过：该采集源部署在局域网、内网或回路地址上，云端后台无法连接。如果您想播放本地源，请在右下角【系统设置】中开启【浏览器极速直连模式】。' });
    return;
  }

  // Generate a distinct stable cache key
  const cacheKey = `${compliantUrl}_ac:${ac || ''}_pg:${pg || ''}_t:${t || ''}_wd:${wd || ''}_ids:${ids || ''}`;
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
    const targetUrl = new URL(compliantUrl);

    // Append query parameters to target URL
    if (ac) targetUrl.searchParams.set('ac', ac as string);
    if (pg) targetUrl.searchParams.set('pg', pg as string);
    if (t) targetUrl.searchParams.set('t', t as string);
    if (wd) targetUrl.searchParams.set('wd', wd as string);
    if (ids) targetUrl.searchParams.set('ids', ids as string);

    console.log(`[CMS Proxy] Fetching: ${targetUrl.toString()}${isForceRefresh ? ' (Bypassing Cache)' : ''}`);

    const response = await robustRequest(targetUrl.toString(), { timeout: 4500 });

    if (response.status < 200 || response.status >= 300) {
       res.status(400).json({ error: `采集源站拒绝了云主页连接（状态码: ${response.status}）。可能是由于该站点的防火墙（WAF）拒绝了海外托管服务器 IP、或者防盗链规则触发。请在右下角【系统设置】中切换为其他采集源，或改用【浏览器极速直连模式】。` });
       return;
    }

    const contentType = response.headers['content-type'] || 'application/json';
    const textData = response.text;

    // Check if response is actually JSON or maybe XML (some providers default to XML if not specified)
    if (textData.trim().startsWith('<')) {
       res.status(400).json({ error: '采集源接口返回了网页/XML内容而非规范 of JSON。该站点可能已更换API或限制公开访问。建议切换其他采集源。' });
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
      res.status(400).json({ error: '解析采集源返回的 JSON 失败，可能接口已被临时拦截或混淆。' });
    }
  } catch (err: any) {
    console.warn('[CMS Proxy Rule Error]', err.message || err);
    const isTimeout = err.name === 'TimeoutError' || err.message?.includes('timeout') || err.message?.includes('Timeout');
    if (isTimeout) {
      res.status(400).json({ error: '代理网关连接该采集源超时（4.5秒无响应）。中国大陆绝大多数免费采集接口部署在低配服务器上，且对海外云平台 IP（如 Vercel, AWS）存在严重的网络抖动或故意拔线屏蔽。建议您调出右下角【系统设置】，将网络请求模式切换至【浏览器极速直连模式】并在浏览器安装【CORS Unblock】跨域插件，即可满速直连，不再受制于云服务器！' });
    } else {
      res.status(400).json({ error: `代理网关连接错误: ${err.message}。建议到页面底部的【系统设置】中切换为其他采集源，或尝试使用【浏览器极速直连模式】搭配对应插件直连。` });
    }
  }
});

// API: Stream proxy for HTTP streams to play securely on HTTPS and bypass CORS issues
app.get('/api/stream-proxy', async (req, res) => {
  const { url } = req.query;
  if (!url || typeof url !== 'string') {
    res.status(400).send('Missing url parameters');
    return;
  }

  if (isPrivateUrl(url)) {
    res.status(400).send('Security check failed: Intranet or loopback stream addresses cannot be proxied by public cloud servers.');
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
    console.warn('[Stream Proxy Error]', err.message || err);
    res.status(502).send(`Stream Proxy failed: ${err.message}`);
  }
});

// API: Parse custom uploaded or online m3u playlist file for batch imports
app.get('/api/parse-m3u', async (req, res) => {
  const { url } = req.query;
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'Missing url parameters' });
    return;
  }

  const compliantUrl = toCompliantUrl(url);

  if (isPrivateUrl(compliantUrl)) {
    res.status(400).json({
      error: '安全检测未通过：该 M3U 订阅源地址部署在局域网、内网或回路地址（如 127.0.0.1）上，云端后台无法直接触达。如果您想加载本地源，请在旁边直接选择【本地文件/纯文本导入】选项，即可直接在您的浏览器端完成本地秒级解析与安全导入！'
    });
    return;
  }

  try {
    const targetUrl = new URL(compliantUrl);
    console.log(`[M3U Parser] Loading file list from: ${compliantUrl}`);

    const response = await robustRequest(compliantUrl);

    if (response.status < 200 || response.status >= 300) {
       res.status(response.status).json({ error: `无法获取该M3U文件 (HTTP 状态码: ${response.status})` });
       return;
    }

    const text = response.text;
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
    console.warn('[M3U Parser Error]', err.message || err);
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

// Helper utilities to strip comments and trailing commas from non-standard TVBox JSON files
function removeJsonComments(str: string): string {
  let clean = str.replace(/\/\*[\s\S]*?\*\//g, '');
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
  return resultLines.join('\n');
}

function cleanJsonString(rawText: string): string {
  let cleaned = removeJsonComments(rawText);
  cleaned = cleaned.replace(/,(\s*[\]}])/g, '$1');
  return cleaned;
}

function tryAesDecrypt(cipherText: string, keyStr: string): string | null {
  try {
    // TVbox AES is usually ECB mode with UTF-8 key
    const key = Buffer.from(keyStr, 'utf8');
    const decipher = crypto.createDecipheriv('aes-128-ecb', key, null);
    decipher.setAutoPadding(true);
    let decrypted = decipher.update(cipherText, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    const trimmedDec = decrypted.trim();
    if (trimmedDec.startsWith('{') || trimmedDec.startsWith('[') || trimmedDec.startsWith('/*') || trimmedDec.startsWith('//')) {
      return decrypted;
    }
  } catch (e) {
    // Try CBC mode with same key as IV
    try {
      const key = Buffer.from(keyStr, 'utf8');
      const iv = Buffer.from(keyStr, 'utf8');
      const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
      decipher.setAutoPadding(true);
      let decrypted = decipher.update(cipherText, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      const trimmedDec = decrypted.trim();
      if (trimmedDec.startsWith('{') || trimmedDec.startsWith('[') || trimmedDec.startsWith('/*') || trimmedDec.startsWith('//')) {
        return decrypted;
      }
    } catch (err) {}
  }
  return null;
}

function rc4Decrypt(cipherBytes: Buffer, key: string): Buffer {
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    s[i] = i;
  }
  let j = 0;
  const keyBytes = Buffer.from(key, 'utf8');
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + keyBytes[i % keyBytes.length]) % 256;
    const temp = s[i];
    s[i] = s[j];
    s[j] = temp;
  }
  let i = 0;
  j = 0;
  const out = Buffer.alloc(cipherBytes.length);
  for (let k = 0; k < cipherBytes.length; k++) {
    i = (i + 1) % 256;
    j = (j + s[i]) % 256;
    const temp = s[i];
    s[i] = s[j];
    s[j] = temp;
    const rnd = s[(s[i] + s[j]) % 256];
    out[k] = cipherBytes[k] ^ rnd;
  }
  return out;
}

function decryptTvBoxConfig(rawText: string): string {
  const trimmed = rawText.trim();
  
  // 1. If it's already a valid JSON string (starts with { or [ or comments)
  if (trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('/*') || trimmed.startsWith('//')) {
    return rawText;
  }

  // 2. If it starts with "**", it's definitely AES-128-ECB or AES-128-CBC
  if (trimmed.startsWith('**')) {
    const cipherText = trimmed.substring(2).trim();
    // Try decrypting with key "1234567812345678"
    const decrypted = tryAesDecrypt(cipherText, "1234567812345678");
    if (decrypted) return decrypted;

    // Try decrypting with key "0123456789abcdef" as a fallback
    const decryptedFallback = tryAesDecrypt(cipherText, "0123456789abcdef");
    if (decryptedFallback) return decryptedFallback;
  }

  // 3. Try standard Base64 and verify if it decodes to JSON
  try {
    // Basic validation of base64 pattern (ignoring newlines/spaces)
    const base64Regex = /^[A-Za-z0-9+/=\s]+$/;
    if (base64Regex.test(trimmed)) {
      const decoded = Buffer.from(trimmed.replace(/\s+/g, ''), 'base64').toString('utf8').trim();
      if (decoded.startsWith('{') || decoded.startsWith('[') || decoded.startsWith('/*') || decoded.startsWith('//')) {
        return decoded;
      }
    }
  } catch (e) {
    // ignore
  }

  // 4. Try AES decryption on the whole raw string as ciphertext (without **)
  const decryptedWhole = tryAesDecrypt(trimmed, "1234567812345678");
  if (decryptedWhole) return decryptedWhole;

  const decryptedWholeFallback = tryAesDecrypt(trimmed, "0123456789abcdef");
  if (decryptedWholeFallback) return decryptedWholeFallback;

  // 5. Try RC4 decryption
  const rc4Keys = ["abc", "123456", "12345678", "tvbox"];
  for (const rc4Key of rc4Keys) {
    try {
      const decodedRc4 = rc4Decrypt(Buffer.from(trimmed, 'base64'), rc4Key);
      const decodedStr = decodedRc4.toString('utf8').trim();
      if (decodedStr.startsWith('{') || decodedStr.startsWith('[') || decodedStr.startsWith('/*') || decodedStr.startsWith('//')) {
        return decodedStr;
      }
    } catch (e) {}
  }

  return rawText;
}

function normalizeTvBoxUrl(urlStr: string): string {
  let u = urlStr.trim();
  try {
    // 1. GitHub Blob / Raw URLs
    if (u.includes('github.com')) {
      u = u.replace(/github\.com\/([^/]+)\/([^/]+)\/(blob|raw)\/([^/]+)\/(.+)/i, 'raw.githubusercontent.com/$1/$2/$4/$5');
    }
    
    // 2. Gitee Blob to Raw URLs
    if (u.includes('gitee.com')) {
      u = u.replace(/gitee\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)/i, 'gitee.com/$1/$2/raw/$3/$4');
      // Append download=true to Gitee raw links to bypass Gitee's landing page disclaimer/preview blocks
      if (u.includes('/raw/') && !u.includes('download=true')) {
        const separator = u.includes('?') ? '&' : '?';
        u = `${u}${separator}download=true`;
      }
    }

    // 3. Gitlab Blob to Raw URLs
    if (u.includes('gitlab.com')) {
      u = u.replace(/gitlab\.com\/([^/]+)\/([^/]+)\/-\/blob\/([^/]+)\/(.+)/i, 'gitlab.com/$1/$2/-/raw/$3/$4');
      u = u.replace(/gitlab\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)/i, 'gitlab.com/$1/$2/raw/$3/$4');
    }

    // 4. Pastebin normal links to raw
    if (u.includes('pastebin.com') && !u.includes('/raw/')) {
      u = u.replace(/pastebin\.com\/([a-zA-Z0-9]+)/i, 'pastebin.com/raw/$1');
    }

    // 5. Github Gist normal link to raw
    if (u.includes('gist.github.com') && !u.endsWith('/raw')) {
      u = u.replace(/gist\.github\.com\/([^/]+)\/([a-f0-9]+)$/i, 'gist.githubusercontent.com/$1/$2/raw');
    }
  } catch (e) {
    console.error('[TVBox URL Normalization Error]', e);
  }
  return u;
}

async function resolveLanzouUrl(urlStr: string): Promise<string> {
  if (!/lanzou[a-z]\.com|lzs\.jp|lanzou\.com/i.test(urlStr)) {
    return urlStr;
  }

  try {
    console.log(`[Lanzou Resolver] Parsing Lanzou URL: ${urlStr}`);
    const parsedUrl = new URL(urlStr);
    const host = parsedUrl.host;
    const protocol = parsedUrl.protocol;
    const mainPage = await robustRequest(urlStr);
    const mainHtml = mainPage.text;

    let iframeUrlStr = '';
    const iframeRegex = /src\s*=\s*['"]([^'"]*\/fn\?[^'"]+)['"]/i;
    const iframeMatch = mainHtml.match(iframeRegex);
    if (iframeMatch) {
      const src = iframeMatch[1];
      iframeUrlStr = src.startsWith('http') ? src : `${protocol}//${host}${src}`;
    } else {
      if (urlStr.includes('/fn?')) {
        iframeUrlStr = urlStr;
      } else {
        const fnMatch = mainHtml.match(/\/fn\?[a-zA-Z0-9_=&]+/i);
        if (fnMatch) {
          iframeUrlStr = `${protocol}//${host}${fnMatch[0]}`;
        }
      }
    }

    if (!iframeUrlStr) {
      console.log(`[Lanzou Resolver] No iframe found, trying to find downprocess directly...`);
      iframeUrlStr = urlStr;
    }

    console.log(`[Lanzou Resolver] Fetching downpage/iframe url: ${iframeUrlStr}`);
    const downPage = await robustRequest(iframeUrlStr, { headers: { 'Referer': urlStr } });
    const downHtml = downPage.text;

    const varValue = (varName: string) => {
      const r = new RegExp(`var\\s+${varName}\\s*=\\s*['"]([^'"]+)['"]`, 'i');
      const m = downHtml.match(r);
      return m ? m[1] : '';
    };

    let sign = varValue('wsign') || varValue('ajaxback') || varValue('sign') || varValue('skid');
    
    if (!sign) {
      const signRegex = /'sign'\s*:\s*'([^']+)'/i;
      const m = downHtml.match(signRegex);
      if (m) {
        sign = m[1];
      }
    }
    if (!sign) {
      const signRegex = /"sign"\s*:\s*"([^"]+)"/i;
      const m = downHtml.match(signRegex);
      if (m) {
        sign = m[1];
      }
    }

    let pId = '';
    const idMatches = [
      /var\s+p_id\s*=\s*['"]([^'"]+)['"]/i,
      /var\s+pkid\s*=\s*['"]([^'"]+)['"]/i,
      /'id'\s*:\s*['"]([^'"]+)['"]/i,
      /'id'\s*:\s*([a-zA-Z0-9_]+)/i
    ];
    for (const regex of idMatches) {
      const m = downHtml.match(regex);
      if (m) {
        pId = m[1];
        if (!pId.startsWith('i') && !/^\d+$/.test(pId)) {
          pId = varValue(pId) || pId;
        }
        break;
      }
    }

    if (!pId) {
      try {
        const urlParsed = new URL(iframeUrlStr);
        pId = urlParsed.searchParams.get('id') || '';
      } catch (pe) {
        // ignore
      }
    }

    console.log(`[Lanzou Resolver] Extracted sign: ${sign}, pId: ${pId}`);
    if (sign) {
      const ajaxUrlStr = iframeUrlStr.includes('/file/') 
        ? new URL('/file/ajaxm.php', iframeUrlStr).toString()
        : new URL('/ajaxm.php', iframeUrlStr).toString();
      
      console.log(`[Lanzou Resolver] Sending AJAX POST: ${ajaxUrlStr}`);
      const payload = `action=downprocess&sign=${encodeURIComponent(sign)}&ves=1&id=${encodeURIComponent(pId)}&p=`;
      
      const ajaxResult = await new Promise<string>((resolve, reject) => {
        const parsedAjaxUrl = new URL(ajaxUrlStr);
        const isHttps = parsedAjaxUrl.protocol === 'https:';
        const client = isHttps ? https : http;
        
        const reqOptions = {
          method: 'POST',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
            'Referer': iframeUrlStr,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json, text/javascript, */*'
          }
        };

        const postReq = client.request(parsedAjaxUrl, reqOptions, (res) => {
          const chunks: any[] = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            resolve(Buffer.concat(chunks).toString('utf-8'));
          });
        });
        postReq.on('error', (err) => reject(err));
        postReq.write(payload);
        postReq.end();
      });

      console.log(`[Lanzou Resolver] AJAX response received: ${ajaxResult}`);
      const ajaxJson = JSON.parse(ajaxResult);
      if (ajaxJson && ajaxJson.zt === 1 && ajaxJson.dom && ajaxJson.url) {
        const downloadUrl = `${ajaxJson.dom}/file/${ajaxJson.url}`;
        console.log(`[Lanzou Resolver] Success! Direct download link is: ${downloadUrl}`);
        return downloadUrl;
      }
    }
  } catch (err: any) {
    console.error(`[Lanzou Resolver] Parsing failed: ${err.message}`);
  }
  return urlStr;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function isValidTvBoxJson(text: string): boolean {
  try {
    const keys = ['sites', 'urls', 'lives', 'parses'];
    const cleaned = cleanJsonString(text);
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object') {
      return keys.some(key => key in parsed);
    }
  } catch (e) {}
  return false;
}

function findTvBoxJsonInString(text: string): string | null {
  let startIdx = -1;
  let scans = 0;
  while (true) {
    startIdx = text.indexOf('{', startIdx + 1);
    if (startIdx === -1 || scans++ > 150) break;
    
    let braceCount = 0;
    let endIdx = -1;
    let inQuote = false;
    for (let i = startIdx; i < text.length; i++) {
      const char = text[i];
      if (char === '\\' && inQuote) {
        i++;
        continue;
      }
      if (char === '"') {
        inQuote = !inQuote;
      }
      if (!inQuote) {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            endIdx = i;
            break;
          }
        }
      }
    }
    if (endIdx !== -1) {
      const candidate = text.substring(startIdx, endIdx + 1);
      if (isValidTvBoxJson(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

function extractConfigFromHtml(html: string): string | null {
  const decodedHtml = decodeHtmlEntities(html);

  // 1. Try finding standard JSON blocks
  const jsonMatch = findTvBoxJsonInString(decodedHtml);
  if (jsonMatch) return jsonMatch;

  // 2. Try scanning for ** encrypted blocks (AES-128-ECB / CBC)
  const aesBaseMatch = decodedHtml.match(/\*\*([a-zA-Z0-9+/=\s]{50,})/g);
  if (aesBaseMatch) {
    for (const match of aesBaseMatch) {
      const cipherText = match.substring(2).trim();
      const decrypted = tryAesDecrypt(cipherText, "1234567812345678");
      if (decrypted && isValidTvBoxJson(decrypted)) return decrypted;
      
      const decryptedFallback = tryAesDecrypt(cipherText, "0123456789abcdef");
      if (decryptedFallback && isValidTvBoxJson(decryptedFallback)) return decryptedFallback;
    }
  }

  // 3. Try finding any potential Base64 / AES / RC4 block
  const base64Regex = /([a-zA-Z0-9+/=\s]{100,})/g;
  let b64Match;
  let scans = 0;
  while ((b64Match = base64Regex.exec(decodedHtml)) !== null && scans++ < 150) {
    const cleanB64 = b64Match[1].replace(/\s+/g, '');
    if (cleanB64.length < 50) continue;

    // A: Plain Base64 check
    try {
      const decoded = Buffer.from(cleanB64, 'base64').toString('utf8').trim();
      if (isValidTvBoxJson(decoded)) {
        return decoded;
      }
    } catch (e) {}

    // B: AES decrypt with key "1234567812345678"
    const decrypted = tryAesDecrypt(cleanB64, "1234567812345678");
    if (decrypted && isValidTvBoxJson(decrypted)) return decrypted;

    // C: AES decrypt with key "0123456789abcdef"
    const decryptedFallback = tryAesDecrypt(cleanB64, "0123456789abcdef");
    if (decryptedFallback && isValidTvBoxJson(decryptedFallback)) return decryptedFallback;

    // D: RC4 decrypt with keys
    const rc4Keys = ["abc", "123456", "12345678", "tvbox"];
    for (const rc4Key of rc4Keys) {
      try {
        const decodedRc4 = rc4Decrypt(Buffer.from(cleanB64, 'base64'), rc4Key);
        const decodedStr = decodedRc4.toString('utf8').trim();
        if (isValidTvBoxJson(decodedStr)) {
          return decodedStr;
        }
      } catch (e) {}
    }
  }

  return null;
}

function isPrivateIp(ip: string): boolean {
  if (!ip) return false;
  // Handle IPv6 loopback
  if (ip === '::1' || ip === '::' || ip === '0:0:0:0:0:0:0:1') return true;
  
  // Clean IPv6-mapped IPv4 e.g. ::ffff:127.0.0.1
  let cleanIp = ip;
  if (ip.startsWith('::ffff:')) {
    cleanIp = ip.substring(7);
  }
  
  // IPv4 checks
  const parts = cleanIp.split('.');
  if (parts.length === 4) {
    const first = parseInt(parts[0], 10);
    const second = parseInt(parts[1], 10);
    if (isNaN(first)) return false;
    
    // 127.0.0.0/8 (Loopback)
    if (first === 127) return true;
    // 10.0.0.0/8 (Private)
    if (first === 10) return true;
    // 192.168.0.0/16 (Private)
    if (first === 192 && second === 168) return true;
    // 172.16.0.0/12 (Private)
    if (first === 172 && second >= 16 && second <= 31) return true;
    // 169.254.0.0/16 (Link-local)
    if (first === 169 && second === 254) return true;
    // 0.0.0.0/8 (Local broadcast)
    if (first === 0) return true;
  }
  return false;
}

// Global Keep-Alive Sockets to drastically optimize payload pipelines and prevent socket hang ups/resets
const httpKeepAliveAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 150,
  maxFreeSockets: 50,
  timeout: 60000,
});

const httpsKeepAliveAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 150,
  maxFreeSockets: 50,
  timeout: 60000,
  rejectUnauthorized: false
});

// Resilient Custom Public DNS Resolver for Chinese dynamic DNS and residential TVBox subscriptions
function resolveHostWithFallback(hostname: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // 1. Try default container DNS resolution first
    dns.lookup(hostname, { all: false }, (err, address) => {
      if (!err && address) {
        resolve(address);
        return;
      }
      
      console.log(`[DNS Fallback] Standard lookup failed for "${hostname}" (${err?.message}). Escalating to ultra-resilient public DNS...`);
      
      // 2. Fallback to public DNS servers (Alibaba, Tencent, Cloudflare, Google core DNS)
      const resolver = new dns.Resolver();
      resolver.setServers(['223.5.5.5', '119.29.29.29', '1.1.1.1', '8.8.8.8']);
      resolver.resolve4(hostname, (resErr, addresses) => {
        if (!resErr && addresses && addresses.length > 0) {
          console.log(`[DNS Fallback] Dynamic resolution successful! "${hostname}" -> ${addresses[0]}`);
          resolve(addresses[0]);
        } else {
          // If DNS absolutely cannot be resolved, reject with original or resolution error
          reject(err || resErr || new Error(`DNS resolution failed for hostname: ${hostname}`));
        }
      });
    });
  });
}

function robustRequest(urlStr: string, options: any = {}): Promise<{ text: string, status: number, headers: any }> {
  // Disable self-signed SSL errors globally to ensure maximum compatibility with tvbox subscription hosts
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  return new Promise((resolve, reject) => {
    const maxRedirects = 5;
    let currentRedirects = 0;

    // Helper to switch to native globalThis.fetch as a robust backup engine
    async function tryFetchFallback(targetUrl: string, reason: string) {
      console.warn(`[robustRequest] Custom HTTP engine failed (${reason}). Activating Fetch-Engine fallback for: ${targetUrl}`);
      try {
        const timeoutMs = options.timeout || 15000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const customHeaders: Record<string, string> = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Encoding': 'gzip, deflate, br',
          ...options.headers
        };

        const response = await fetch(targetUrl, {
          method: 'GET',
          headers: customHeaders,
          signal: controller.signal,
          redirect: 'follow'
        });

        clearTimeout(timeoutId);

        const text = await response.text();
        const headersObj: Record<string, string> = {};
        response.headers.forEach((val, name) => {
          headersObj[name] = val;
        });

        console.log(`[robustRequest] Fetch-Engine fallback succeeded! Status: ${response.status}`);
        resolve({
          text,
          status: response.status || 200,
          headers: headersObj
        });
      } catch (fetchErr: any) {
        console.error(`[robustRequest] Fetch-Engine fallback also failed: ${fetchErr.message || fetchErr}`);
        reject(new Error(`Both HTTP engines failed: ${reason} / ${fetchErr.message}`));
      }
    }

    function execute(currentUrl: string) {
      try {
        const parsedUrl = new URL(currentUrl);
        const protocol = parsedUrl.protocol.toLowerCase();
        if (protocol !== 'http:' && protocol !== 'https:') {
          reject(new Error(`Security block: Unsupported protocol ${protocol}`));
          return;
        }

        const hostname = parsedUrl.hostname;

        resolveHostWithFallback(hostname)
          .then((address) => {
            if (isPrivateIp(address)) {
              reject(new Error(`安全检测未通过：禁止访问局域网或本地 IP 地址 (${address})`));
              return;
            }

            const isHttps = protocol === 'https:';
            const client = isHttps ? https : http;
            const agent = isHttps ? httpsKeepAliveAgent : httpKeepAliveAgent;

            const reqOptions = {
              method: 'GET',
              agent: agent,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Encoding': 'gzip, deflate, br',
                ...options.headers
              },
              timeout: options.timeout || 15000
            };

            const req = client.get(parsedUrl, reqOptions, (res) => {
              if ([301, 302, 303, 307, 308].includes(res.statusCode || 0)) {
                const location = res.headers.location;
                if (location) {
                  currentRedirects++;
                  if (currentRedirects > maxRedirects) {
                    reject(new Error('Too many redirects'));
                    return;
                  }
                  const nextUrl = new URL(location, currentUrl).toString();
                  execute(nextUrl);
                  return;
                }
              }

              const chunks: any[] = [];
              res.on('data', (chunk) => {
                chunks.push(chunk);
              });
              res.on('end', () => {
                try {
                  let buffer = Buffer.concat(chunks);
                  const contentEncoding = (res.headers['content-encoding'] || '').toLowerCase();
                  
                  if (contentEncoding === 'gzip') {
                    buffer = zlib.gunzipSync(buffer);
                  } else if (contentEncoding === 'deflate') {
                    buffer = zlib.inflateSync(buffer);
                  } else if (contentEncoding === 'br') {
                    buffer = zlib.brotliDecompressSync(buffer);
                  }
                  
                  resolve({
                    text: buffer.toString('utf8'),
                    status: res.statusCode || 200,
                    headers: res.headers
                  });
                } catch (decompressionErr: any) {
                  console.error(`[robustRequest] Decompression failed: ${decompressionErr.message}`);
                  try {
                    const rawBuffer = Buffer.concat(chunks);
                    resolve({
                      text: rawBuffer.toString('utf8'),
                      status: res.statusCode || 200,
                      headers: res.headers
                    });
                  } catch (fallbackErr) {
                    tryFetchFallback(currentUrl, `Decompression Failed: ${decompressionErr.message}`);
                  }
                }
              });
            });

            req.on('error', (err: any) => {
              tryFetchFallback(currentUrl, err.message || 'Socket connection reset');
            });

            req.on('timeout', () => {
              req.destroy();
              tryFetchFallback(currentUrl, 'Connection timeout (15s)');
            });
          })
          .catch((dnsErr) => {
            tryFetchFallback(currentUrl, dnsErr.message || 'DNS resolution failed');
          });
      } catch (err: any) {
        tryFetchFallback(currentUrl, err.message || 'Execution error');
      }
    }

    execute(urlStr);
  });
}

// API: Parse custom TVBox subscription files
app.get('/api/parse-tvbox', async (req, res) => {
  const { url } = req.query;
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'Missing TVBox subscription URL configuration' });
    return;
  }

  // Support Chinese characters in domain name (IDN like 毒盒.com / 饭太硬.com) and unencoded Chinese path parts safely
  const compliantUrl = toCompliantUrl(url);

  // Normalize URL first (e.g. convert GitHub page to raw download url)
  let normalizedUrl = normalizeTvBoxUrl(compliantUrl);

  if (isPrivateUrl(normalizedUrl)) {
    res.status(400).json({
      error: '安全检测未通过：该 TVBox 订阅源地址部署在局域网、内网或回路地址（如 127.0.0.1）上，云端后台无法直接触达。如果您想加载本地源，请在旁边直接选择【本地文件/纯文本导入】选项，在您的浏览器端直接完成本地安全导入！'
    });
    return;
  }

  // 1. Detect and resolve Lanzou links first
  if (/lanzou[a-z]\.com|lzs\.jp|lanzou\.com/i.test(normalizedUrl)) {
    try {
      console.log(`[TVBox Pre-processor] Resolving Lanzou link: ${normalizedUrl}`);
      const directUrl = await resolveLanzouUrl(normalizedUrl);
      if (directUrl && directUrl !== normalizedUrl) {
        console.log(`[TVBox Pre-processor] Successfully resolved Lanzou direct url: ${directUrl}`);
        normalizedUrl = directUrl;
      }
    } catch (lanzouErr: any) {
      console.warn('[TVBox Pre-processor] Failed to resolve Lanzou URL', lanzouErr.message);
    }
  }

  try {
    console.log(`[TVBox Parser] Loading subscription from original: ${url} -> normalized: ${normalizedUrl}`);

    let response: any = null;
    let fetchError: any = null;

    // First try standard request
    try {
      response = await robustRequest(normalizedUrl);
    } catch (err: any) {
      console.warn(`[TVBox Parser] Standard fetch failed: ${err.message || err}`);
      fetchError = err;
    }

    let rawText = '';
    let isHtml = false;
    let extractedText: string | null = null;

    if (response) {
      rawText = response.text || '';
      const trimmedRaw = rawText.trim();
      isHtml = trimmedRaw.startsWith('<') || trimmedRaw.toLowerCase().includes('<!doctype html') || trimmedRaw.toLowerCase().includes('<html');
      if (isHtml) {
        extractedText = extractConfigFromHtml(rawText);
      }
    }

    // Try TVBox User-Agent Fallback if standard fetch failed, returned errors, or returned HTML with unextractable content.
    // This bypasses anti-crawler protections on dedicated TVBox subscription services (like fty.333232.xyz, 毒盒.com, etc.).
    if (!response || response.status < 200 || response.status >= 300 || (isHtml && !extractedText)) {
      const okhttpUserAgents = [
        'okhttp/3.15',
        'okhttp/3.12.1',
        'okhttp/4.9.0',
        'okhttp/3.15.0'
      ];
      
      console.log(`[TVBox Parser Fallback] Standalone/WAF block detected or request failed. Retrying with TVBox User-Agents sequentially...`);
      
      for (const ua of okhttpUserAgents) {
        try {
          console.log(`[TVBox Parser Fallback] Trying TVBox User-Agent: ${ua}...`);
          const okHttpResponse = await robustRequest(normalizedUrl, {
            headers: {
              'User-Agent': ua,
              'Accept': '*/*'
            }
          });
          if (okHttpResponse && okHttpResponse.status === 200) {
            const okText = okHttpResponse.text || '';
            const trimmedOk = okText.trim();
            const isOkHtml = trimmedOk.startsWith('<') || trimmedOk.toLowerCase().includes('<!doctype html') || trimmedOk.toLowerCase().includes('<html');
            
            let okExtracted: string | null = null;
            if (isOkHtml) {
              okExtracted = extractConfigFromHtml(okText);
            }

            if (!isOkHtml || okExtracted) {
              console.log(`[TVBox Parser Fallback] Successfully fetched TVBox config using ${ua}!`);
              response = okHttpResponse;
              rawText = okText;
              isHtml = isOkHtml;
              extractedText = okExtracted;
              fetchError = null;
              break;
            }
          }
        } catch (okHttpErr: any) {
          console.warn(`[TVBox Parser Fallback] TVBox UA ${ua} fetch retry failed: ${okHttpErr.message || okHttpErr}`);
        }
      }
    }

    // 2. Fallback: If request failed, got bad status, or received HTML that couldn't be extracted,
    // and it is a GitHub link, try various public raw proxies and mirrors.
    const isGithub = normalizedUrl.includes('github.com') || normalizedUrl.includes('raw.githubusercontent.com');
    if (isGithub && (!response || response.status < 200 || response.status >= 300 || (isHtml && !extractedText))) {
      console.log(`[TVBox Parser Fallback] GitHub request issue detected. Trying stable mirror nodes...`);
      const mirrors = [
        normalizedUrl.replace('raw.githubusercontent.com', 'raw.gitmirror.com').replace('github.com', 'raw.gitmirror.com'),
        normalizedUrl.replace('raw.githubusercontent.com', 'raw.githubusercontents.com').replace('github.com', 'raw.githubusercontents.com'),
        normalizedUrl.startsWith('https://') 
          ? 'https://ghproxy.net/' + normalizedUrl 
          : 'https://ghproxy.net/https://' + normalizedUrl.replace('http://', ''),
        normalizedUrl.startsWith('https://') 
          ? 'https://mirror.ghproxy.com/' + normalizedUrl 
          : 'https://mirror.ghproxy.com/https://' + normalizedUrl.replace('http://', '')
      ];

      for (const mirror of mirrors) {
        try {
          console.log(`[TVBox Parser Fallback] Trying mirror source: ${mirror}`);
          const mirrorRes = await robustRequest(mirror);
          if (mirrorRes && mirrorRes.status >= 200 && mirrorRes.status < 300) {
            const mText = mirrorRes.text || '';
            const trimmedM = mText.trim();
            const isMirrorHtml = trimmedM.startsWith('<') || trimmedM.toLowerCase().includes('<!doctype html') || trimmedM.toLowerCase().includes('<html');
            
            if (isMirrorHtml) {
              const ext = extractConfigFromHtml(mText);
              if (ext) {
                response = mirrorRes;
                rawText = ext;
                isHtml = false;
                extractedText = ext;
                fetchError = null;
                console.log(`[TVBox Parser Fallback] Successfully parsed and extracted TVBox json from mirror HTML!`);
                break;
              }
            } else {
              response = mirrorRes;
              rawText = mText;
              isHtml = false;
              extractedText = null;
              fetchError = null;
              console.log(`[TVBox Parser Fallback] Successfully retrieved mirror raw data!`);
              break;
            }
          }
        } catch (mirrorErr: any) {
          console.warn(`[TVBox Parser Fallback] Mirror ${mirror} failed: ${mirrorErr.message}`);
        }
      }
    }

    if (!response) {
      throw fetchError || new Error('无法连接目标服务器');
    }

    if (response.status < 200 || response.status >= 300) {
       res.status(response.status).json({ error: `无法获取该TVBox订阅源 (HTTP 状态码: ${response.status})` });
       return;
    }

    if (isHtml && !extractedText) {
       res.status(400).json({ 
         error: `获取到的数据为 HTML 网页格式（如 Cloudflare 安全防护阻断、人机验证拦截或云存储分享界面），而非可解析的 TVBox 订阅数据。\n由于该节点有防御盾或下载受阻，您可以点击下方切换至【本地/纯文本导入】选项，只需将文件内容直接粘贴到文本框，即可绕开所有的网络屏障，100%成功秒级瞬间装载您的影视多源采集线！` 
       });
       return;
    }

    if (extractedText) {
      rawText = extractedText;
    }

    const decodedText = decryptTvBoxConfig(rawText);
    const cleanText = cleanJsonString(decodedText);
    
    let config: any;
    try {
      config = JSON.parse(cleanText);
    } catch (parseErr: any) {
      console.warn('[TVBox Parser JSON error]', parseErr.message);
      res.status(400).json({ error: `解析 JSON 配置文件失败。电视订阅源可能采用了未知的加密算法或强混淆。请确认并在旁边直接粘贴标准的明文 JSON 结构内容。` });
      return;
    }

    if (!config || !Array.isArray(config.sites)) {
      res.status(400).json({ error: '无效格式的 TVBox 订阅协议：未在文件中提取到 "sites" 站点配置数组项。' });
      return;
    }

    const cmsSources: any[] = [];
    config.sites.forEach((site: any, idx: number) => {
      if (site && site.name && site.api && typeof site.api === 'string') {
        const urlStr = site.api.trim();
        if (urlStr.startsWith('http://') || urlStr.startsWith('https://')) {
          cmsSources.push({
            id: `tvbox_${idx}_${Math.random().toString(36).substring(2, 7)}_${Date.now()}`,
            name: `${site.name.trim()} (TVBox)`,
            url: urlStr,
            status: 'active'
          });
        }
      }
    });

    res.json({ success: true, count: cmsSources.length, sites: cmsSources });
  } catch (err: any) {
    console.warn('[TVBox Parser Error]', err.message || err);
    res.status(400).json({ error: `无法解析 TVBox 订阅源，这可能是由于获取超时、连接被拒绝（Connection Refused）或地址不正确。具体原因: ${err.message}` });
  }
});

// Serve frontend application assets
async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
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
