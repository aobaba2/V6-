import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Play, Tv, ShieldAlert, CheckCircle2, RotateCcw, ExternalLink } from 'lucide-react';
import { M3U8Parser } from '../types';

interface VideoPlayerProps {
  playUrl: string;
  title: string;
  episodeName: string;
  parser: M3U8Parser | null; // null represents internal list player
  onNavigateEpisode?: (direction: 'prev' | 'next') => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  initialTime?: number;
  onTimeUpdate?: (currentTime: number) => void;
}

export default function VideoPlayer({
  playUrl,
  title,
  episodeName,
  parser,
  onNavigateEpisode,
  hasPrev = false,
  hasNext = false,
  initialTime = 0,
  onTimeUpdate
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [scaleMode, setScaleMode] = useState<'contain' | 'fill' | 'cover'>('contain');
  const hlsRef = useRef<Hls | null>(null);

  const [showResumeNotice, setShowResumeNotice] = useState(false);
  const lastSavedTimeRef = useRef<number>(0);
  const initialTimeAppliedRef = useRef<string>('');
  const initialTimeRef = useRef<number>(initialTime);

  // Sync initialTime with initialTimeRef.current
  useEffect(() => {
    initialTimeRef.current = initialTime;
  }, [initialTime]);

  // Determine whether to use external parser (Iframe) or internal Hls.js player
  const useParser = parser !== null && parser.id !== 'internal';
  const parserUrl = useParser ? `${parser!.url}${encodeURIComponent(playUrl)}` : undefined;

  const formatProgressTime = (seconds: number): string => {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    
    const pad = (num: number) => String(num).padStart(2, '0');
    
    if (h > 0) {
      return `${pad(h)}:${pad(m)}:${pad(s)}`;
    }
    return `${pad(m)}:${pad(s)}`;
  };

  useEffect(() => {
    // Reset state when url changes
    setErrorMsg(null);
    setIsReady(false);
    setShowResumeNotice(false);

    if (useParser || !playUrl) return;

    const video = videoRef.current;
    if (!video) return;

    // Clean up previous Hls instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    // Proxy HTTP streams automatically to circumvent browser Mixed Content security sandboxes and CORS logs
    const playableUrl = playUrl.startsWith('http://') 
      ? `/api/stream-proxy?url=${encodeURIComponent(playUrl)}`
      : playUrl;

    let onLoadedMetadata: (() => void) | null = null;
    let onError: (() => void) | null = null;

    if (Hls.isSupported()) {
      const hls = new Hls({
        maxMaxBufferLength: 30,
        enableWorker: true,
        lowLatencyMode: true,
      });
      hlsRef.current = hls;

      hls.loadSource(playableUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsReady(true);
        const currentInitTime = initialTimeRef.current;
        if (currentInitTime && currentInitTime > 0 && initialTimeAppliedRef.current !== playUrl) {
          video.currentTime = currentInitTime;
          initialTimeAppliedRef.current = playUrl;
          lastSavedTimeRef.current = currentInitTime;
          setShowResumeNotice(true);
          const timer = setTimeout(() => {
            setShowResumeNotice(false);
          }, 5000);
          return () => clearTimeout(timer);
        }
        video.play().catch(() => {
          console.log("Playback autofail, waiting for user interaction");
        });
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.warn("Fatal network error in HLS playback, trying to recover...");
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn("Fatal media error in HLS, recovering...");
              hls.recoverMediaError();
              break;
            default:
              setErrorMsg('该M3U8地址解码失败，可能存在跨域拦截或格式问题。建议切换右下方“画质/解析源”使用第三方接口播放。');
              hls.destroy();
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native Apple HLS (Safari/iOS) fallback
      video.src = playableUrl;
      onLoadedMetadata = () => {
        setIsReady(true);
        const currentInitTime = initialTimeRef.current;
        if (currentInitTime && currentInitTime > 0 && initialTimeAppliedRef.current !== playUrl) {
          video.currentTime = currentInitTime;
          initialTimeAppliedRef.current = playUrl;
          lastSavedTimeRef.current = currentInitTime;
          setShowResumeNotice(true);
          setTimeout(() => {
            setShowResumeNotice(false);
          }, 5000);
        }
        video.play().catch(() => {});
      };
      onError = () => {
        setErrorMsg('iOS Safari 播放失败，请尝试刷新。若链接失效或不支持，请尝试切换外部解析播放。');
      };

      video.addEventListener('loadedmetadata', onLoadedMetadata);
      video.addEventListener('error', onError);
    } else {
      setErrorMsg('您的浏览器不支持 HLS (.m3u8) 视频播放。请尝试在Chrome/Edge中播放，或在解析设置中使用网页嵌套。');
    }

    return () => {
      if (video) {
        if (onLoadedMetadata) video.removeEventListener('loadedmetadata', onLoadedMetadata);
        if (onError) video.removeEventListener('error', onError);
      }
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [playUrl, useParser]);

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    const currentTime = video.currentTime;
    
    // Throttle parent callback to avoid lag
    if (onTimeUpdate && Math.abs(currentTime - lastSavedTimeRef.current) > 3) {
      lastSavedTimeRef.current = currentTime;
      onTimeUpdate(currentTime);
    }
  };

  return (
    <div className="w-full bg-slate-950 rounded-xl overflow-hidden shadow-2xl transition-all duration-300 relative border border-slate-800" id="video-cinema-viewport">
      {/* Player Header */}
      <div className="bg-slate-900 px-4 py-3 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center space-x-3 truncate">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400">
            <Tv className="h-4.5 w-4.5" />
          </div>
          <div className="truncate">
            <h3 className="text-sm font-semibold text-slate-100 truncate">{title}</h3>
            <p className="text-xs text-slate-400 mt-0.5 font-mono truncate">{episodeName || '默认播放源'}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2 shrink-0">
          <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-800 text-slate-300 rounded-full dark:border border-slate-700">
            {useParser ? `外部接口: ${parser!.name}` : '内置独家播放器'}
          </span>
        </div>
      </div>

      {/* Main Screen */}
      <div className="aspect-[16/9] w-full relative bg-slate-950 flex items-center justify-center">
        {useParser ? (
          /* Iframe parser */
          <iframe
            id="iframe-play-engine"
            src={parserUrl}
            className="w-full h-full bg-black"
            allowFullScreen
            allow="autoplay; encrypted-media; picture-in-picture"
            title="External Video Player Iframe"
            referrerPolicy="no-referrer"
          />
        ) : (
          /* Native/HlsJS player */
          <div className="w-full h-full relative group">
            <video
              id="h5-video-node"
              ref={videoRef}
              className="w-full h-full"
              style={{ objectFit: scaleMode }}
              controls
              playsInline
              preload="auto"
              onTimeUpdate={handleTimeUpdate}
            />
            {!isReady && !errorMsg && (
              <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-center space-y-3 pointer-events-none transition-opacity duration-300">
                <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-500 border-t-transparent" />
                <span className="text-slate-300 text-xs tracking-wider">正在加载 HLS 流，请耐心等待...</span>
              </div>
            )}

            {/* Resume progress notification notice */}
            {showResumeNotice && (
              <div className="absolute bottom-16 left-4 bg-slate-900/95 text-slate-100 text-xs px-3.5 py-2.5 rounded-lg border border-slate-700 shadow-2xl flex items-center space-x-2.5 z-40 transition-all duration-300">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <span>已为您自动恢复上次播放进度至 <strong className="text-emerald-400">{formatProgressTime(initialTime)}</strong></span>
                <button 
                  onClick={() => {
                    const video = videoRef.current;
                    if (video) {
                      video.currentTime = 0;
                      if (onTimeUpdate) onTimeUpdate(0);
                    }
                    setShowResumeNotice(false);
                  }}
                  className="text-blue-400 hover:text-blue-300 font-bold ml-2 underline hover:no-underline flex items-center space-x-1"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>重新开始</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Dynamic Errors Container */}
        {errorMsg && !useParser && (
          <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center px-6 text-center space-y-4" id="player-error">
            <ShieldAlert className="h-12 w-12 text-rose-500 animate-pulse" />
            <div className="max-w-md">
              <h4 className="text-slate-100 font-semibold text-sm">此视频播放失败</h4>
              <p className="text-slate-400 text-xs mt-2 leading-relaxed font-mono bg-slate-900/55 p-3 rounded border border-slate-800">
                {errorMsg}
              </p>
              <div className="mt-2 text-[11px] text-blue-400 break-all p-1.5 opacity-80">
                链接: <span className="underline select-all">{playUrl}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <a
                href={playUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-3.5 py-1.5 rounded-lg border border-slate-700 transition"
              >
                <span>直接下载 / 外部播放</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Play Controls & Quick Switches */}
      <div className="bg-slate-900/90 px-4 py-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="text-slate-400 flex items-center space-x-1 font-mono text-[11px] max-w-[280px] sm:max-w-md truncate">
          <span className="text-slate-500 shrink-0">当前流:</span>
          <span className="text-slate-300 select-all truncate">{playUrl}</span>
        </div>

        <div className="flex items-center space-x-2 flex-wrap gap-2">
          {!useParser && (
            <div className="flex items-center space-x-1 bg-slate-800/80 p-0.5 rounded-lg border border-slate-700/80 mr-1">
              <span className="text-[10px] text-slate-400 px-2 font-medium shrink-0">画面设置:</span>
              {(['contain', 'fill', 'cover'] as const).map(mode => {
                const labels = {
                  contain: '📺 原始/等比',
                  fill: '↔️ 拉伸填充',
                  cover: '✂️ 裁剪画面'
                };
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setScaleMode(mode)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer select-none ${
                      scaleMode === mode
                        ? 'bg-blue-600 text-white shadow-[0_2px_8px_rgba(37,99,235,0.3)]'
                        : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
                    }`}
                  >
                    {labels[mode]}
                  </button>
                );
              })}
            </div>
          )}

          {onNavigateEpisode && (
            <div className="flex items-center space-x-1 bg-slate-850 p-0.5 rounded-lg border border-slate-800">
              <button
                id="btn-prev-ep"
                onClick={() => onNavigateEpisode('prev')}
                disabled={!hasPrev}
                className={`px-3 py-1.5 rounded-md transition font-medium ${
                  hasPrev
                    ? 'text-slate-200 hover:bg-slate-800'
                    : 'text-slate-600 cursor-not-allowed opacity-50'
                }`}
              >
                上一集
              </button>
              <button
                id="btn-next-ep"
                onClick={() => onNavigateEpisode('next')}
                disabled={!hasNext}
                className={`px-3 py-1.5 rounded-md transition font-medium ${
                  hasNext
                    ? 'text-slate-200 hover:bg-slate-800'
                    : 'text-slate-600 cursor-not-allowed opacity-50'
                }`}
              >
                下一集
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
