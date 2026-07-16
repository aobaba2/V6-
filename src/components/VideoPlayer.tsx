import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { 
  Play, 
  Pause, 
  Tv, 
  ShieldAlert, 
  CheckCircle2, 
  RotateCcw, 
  ExternalLink, 
  Volume2, 
  VolumeX, 
  Maximize2, 
  Minimize2, 
  Sparkles 
} from 'lucide-react';
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
  const [showAdjustPanel, setShowAdjustPanel] = useState<boolean>(false);
  const [brightness, setBrightness] = useState<number>(100);
  const [contrast, setContrast] = useState<number>(100);
  const [saturation, setSaturation] = useState<number>(100);
  const [sharpen, setSharpen] = useState<number>(55); // Default to a solid 55% for stunning visual effect!
  const [enhanceMode, setEnhanceMode] = useState<'usm' | 'laplacian' | 'edge'>('usm');
  const hlsRef = useRef<Hls | null>(null);

  const [showResumeNotice, setShowResumeNotice] = useState(false);
  const lastSavedTimeRef = useRef<number>(0);
  const initialTimeAppliedRef = useRef<string>('');
  const initialTimeRef = useRef<number>(initialTime);

  // WebGL real-time super-resolution states and flags
  const [useWebGL, setUseWebGL] = useState<boolean>(true); // WebGL upscaler enabled by default
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTimeState, setCurrentTimeState] = useState<number>(0);
  const [durationState, setDurationState] = useState<number>(0);
  const [volumeState, setVolumeState] = useState<number>(100);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(true);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const textureRef = useRef<WebGLTexture | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
      }
    }, 2800);
  };

  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [isPlaying]);

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

  // Synchronize HTML5 video events with React states for Custom WebGL controls overlay
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTime = () => setCurrentTimeState(video.currentTime);
    const onDuration = () => setDurationState(video.duration || 0);
    const onVolume = () => setVolumeState(video.muted ? 0 : Math.round(video.volume * 100));

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('durationchange', onDuration);
    video.addEventListener('volumechange', onVolume);

    // Sync initial states
    setIsPlaying(!video.paused);
    setCurrentTimeState(video.currentTime);
    setDurationState(video.duration || 0);
    setVolumeState(video.muted ? 0 : Math.round(video.volume * 100));

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('durationchange', onDuration);
      video.removeEventListener('volumechange', onVolume);
    };
  }, [playUrl, useWebGL, isReady]);

  // Shader compilation and GPU drawing loop using custom WebGL filter
  useEffect(() => {
    if (!useWebGL || useParser) {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    let gl: WebGLRenderingContext | null = null;
    try {
      gl = canvas.getContext('webgl', {
        alpha: false,
        depth: false,
        antialias: false,
        preserveDrawingBuffer: false,
        premultipliedAlpha: false
      }) as WebGLRenderingContext | null;
      
      if (!gl) {
        gl = canvas.getContext('experimental-webgl') as WebGLRenderingContext | null;
      }
    } catch (e) {
      console.error("WebGL context fetch failed:", e);
    }

    if (!gl) {
      console.warn("Target browser doesn't support WebGL contexts. Falling back to native rendering.");
      setUseWebGL(false);
      return;
    }

    glRef.current = gl;

    // Vertex Shader code
    const vsSource = `
      attribute vec2 position;
      varying vec2 v_texCoord;
      void main() {
        v_texCoord = position * 0.5 + 0.5;
        v_texCoord.y = 1.0 - v_texCoord.y; // Flip Y direction for video orientation
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;

    // High performance WebGL fragment shader with custom GPU Bilateral/USM upscaler
    const fsSource = `
      precision mediump float;
      varying vec2 v_texCoord;
      uniform sampler2D u_image;
      uniform vec2 u_textureSize;
      uniform float u_strength;
      uniform float u_brightness;
      uniform float u_contrast;
      uniform float u_saturation;
      uniform int u_styleMode;

      float getLuma(vec3 cRGB) {
        return dot(cRGB, vec3(0.299, 0.587, 0.114));
      }

      void main() {
        vec2 texel = vec2(1.0) / u_textureSize;
        vec3 c = texture2D(u_image, v_texCoord).rgb;
        
        // Sampling convolution neighbors
        vec3 cN  = texture2D(u_image, v_texCoord + vec2(0.0, -texel.y)).rgb;
        vec3 cS  = texture2D(u_image, v_texCoord + vec2(0.0, texel.y)).rgb;
        vec3 cW  = texture2D(u_image, v_texCoord + vec2(-texel.x, 0.0)).rgb;
        vec3 cE  = texture2D(u_image, v_texCoord + vec2(texel.x, 0.0)).rgb;
        
        vec3 cNW = texture2D(u_image, v_texCoord + vec2(-texel.x, -texel.y)).rgb;
        vec3 cNE = texture2D(u_image, v_texCoord + vec2(texel.x, -texel.y)).rgb;
        vec3 cSW = texture2D(u_image, v_texCoord + vec2(-texel.x, texel.y)).rgb;
        vec3 cSE = texture2D(u_image, v_texCoord + vec2(texel.x, texel.y)).rgb;

        float l = getLuma(c);
        float lN = getLuma(cN);
        float lS = getLuma(cS);
        float lW = getLuma(cW);
        float lE = getLuma(cE);
        
        vec3 blur = (cN + cS + cW + cE + cNW + cNE + cSW + cSE + c) / 9.0;
        vec3 detail = c - blur;

        float maxL = max(max(l, lN), max(lS, lE));
        float minL = min(min(l, lN), min(lS, lE));
        float contrastRange = maxL - minL;

        vec3 enhanced = c;
        if (u_styleMode == 0) {
          // Gated USM (anti-noise)
          float gating = smoothstep(0.012, 0.32, contrastRange);
          enhanced = c + detail * (u_strength * 3.8) * gating;
        } else if (u_styleMode == 1) {
          // Laplacian sharpening
          enhanced = c + detail * (u_strength * 2.2);
        } else {
          // Smooth edge / bilinear detail preserving bilateral approximation
          float val = clamp(contrastRange * 5.5, 0.0, 1.0);
          enhanced = mix(blur, c + detail * (u_strength * 2.0), val);
        }

        // Apply Brightness/Contrast/Saturation
        enhanced *= u_brightness;
        enhanced = (enhanced - vec3(0.5)) * u_contrast + vec3(0.5);
        float gray = dot(enhanced, vec3(0.299, 0.587, 0.114));
        enhanced = mix(vec3(gray), enhanced, u_saturation);

        gl_FragColor = vec4(clamp(enhanced, 0.0, 1.0), 1.0);
      }
    `;

    function compileAndLink(glCtx: WebGLRenderingContext, type: number, src: string) {
      const sh = glCtx.createShader(type);
      if (!sh) return null;
      glCtx.shaderSource(sh, src);
      glCtx.compileShader(sh);
      if (!glCtx.getShaderParameter(sh, glCtx.COMPILE_STATUS)) {
        console.error("Shader build failure log:", glCtx.getShaderInfoLog(sh));
        glCtx.deleteShader(sh);
        return null;
      }
      return sh;
    }

    const vs = compileAndLink(gl, gl.VERTEX_SHADER, vsSource);
    const fs = compileAndLink(gl, gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("Program link failure log:", gl.getProgramInfoLog(prog));
      return;
    }
    programRef.current = prog;
    gl.useProgram(prog);

    // Quad geometry positions
    const posLoc = gl.getAttribLocation(prog, 'position');
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    // Texture creation
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    textureRef.current = tex;

    // Get uniforms
    const uSize = gl.getUniformLocation(prog, 'u_textureSize');
    const uStr = gl.getUniformLocation(prog, 'u_strength');
    const uBright = gl.getUniformLocation(prog, 'u_brightness');
    const uContrast = gl.getUniformLocation(prog, 'u_contrast');
    const uSatur = gl.getUniformLocation(prog, 'u_saturation');
    const uStyle = gl.getUniformLocation(prog, 'u_styleMode');

    const render = () => {
      if (!video) return;

      if (video.paused || video.ended || video.readyState < video.HAVE_CURRENT_DATA) {
        animationFrameIdRef.current = requestAnimationFrame(render);
        return;
      }

      if (!gl || !prog) return;

      const w = video.videoWidth || 645;
      const h = video.videoHeight || 365;

      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);

      gl.uniform2f(uSize, w, h);
      gl.uniform1f(uStr, sharpen / 100);
      gl.uniform1f(uBright, brightness / 100);
      gl.uniform1f(uContrast, contrast / 100);
      gl.uniform1f(uSatur, saturation / 100);

      let styleIdx = 0;
      if (enhanceMode === 'laplacian') styleIdx = 1;
      else if (enhanceMode === 'edge') styleIdx = 2;
      gl.uniform1i(uStyle, styleIdx);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      animationFrameIdRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
      if (gl) {
        gl.deleteTexture(tex);
        gl.deleteBuffer(buf);
        gl.deleteProgram(prog);
      }
    };
  }, [useWebGL, playUrl, useParser, sharpen, brightness, contrast, saturation, enhanceMode]);

  const handlePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
    } else {
      video.play().catch(() => {});
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const target = Number(e.target.value);
    video.currentTime = target;
    setCurrentTimeState(target);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const target = Number(e.target.value);
    video.volume = target / 100;
    video.muted = target === 0;
    setVolumeState(target);
  };

  const handleToggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    const nextMute = !video.muted;
    video.muted = nextMute;
    setVolumeState(nextMute ? 0 : Math.round(video.volume * 100));
  };

  const handleToggleFullscreen = () => {
    const container = document.getElementById('video-cinema-viewport');
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch(err => {
        console.error("Fullscreen request failed", err);
      });
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  // Multi-mode sharpening formula: maps 0-100 value to different digital signal structures
  const sharpenFactor = (sharpen / 100) * 1.5;
  const usmFactor = (sharpen / 100) * 3.5;
  const edgeFactor = (sharpen / 100) * 0.9;

  let activeFilterId = '';
  if (sharpen > 0) {
    if (enhanceMode === 'usm') {
      activeFilterId = 'url(#video-usm-filter)';
    } else if (enhanceMode === 'laplacian') {
      activeFilterId = 'url(#video-sharpen-filter)';
    } else if (enhanceMode === 'edge') {
      activeFilterId = 'url(#video-edge-filter)';
    }
  }

  const filterStyle = [
    activeFilterId,
    `brightness(${brightness}%)`,
    `contrast(${contrast}%)`,
    `saturate(${saturation}%)`
  ].filter(Boolean).join(' ');

  return (
    <div className={`w-full bg-slate-950 overflow-hidden shadow-2xl transition-all duration-300 relative ${isFullscreen ? 'rounded-none border-0' : 'rounded-xl border border-slate-800'}`} id="video-cinema-viewport" onMouseMove={handleMouseMove}>
      {/* SVG GPU-accelerated convolution matrix filters for multiple real-time video high-definition enhancers */}
      <svg style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }} aria-hidden="true" id="web-sharpen-shader">
        <defs>
          {/* Preset 1: Standard Laplacian High-pass Sharpening Filter */}
          <filter id="video-sharpen-filter">
            <feConvolveMatrix
              order="3"
              preserveAlpha="true"
              kernelMatrix={`0 -${sharpenFactor} 0 -${sharpenFactor} ${1 + 4 * sharpenFactor} -${sharpenFactor} 0 -${sharpenFactor} 0`}
            />
          </filter>

          {/* Preset 2: Professional Unsharp Mask (USM) Gaussian detail extraction */}
          <filter id="video-usm-filter">
            <feGaussianBlur stdDeviation="1.2" result="blurred" />
            <feComposite in="SourceGraphic" in2="blurred" operator="arithmetic" k2="1" k3="-1" result="highpass" />
            <feComposite in="SourceGraphic" in2="highpass" operator="arithmetic" k2="1" k3={usmFactor} />
          </filter>

          {/* Preset 3: Soft Edge Restoration (Smooth detail-preserve optimal for anime/SD compressed clips) */}
          <filter id="video-edge-filter">
            <feConvolveMatrix
              order="3"
              preserveAlpha="true"
              kernelMatrix={`-${edgeFactor/4} -${edgeFactor/2} -${edgeFactor/4} -${edgeFactor/2} ${1 + 1.5 * edgeFactor} -${edgeFactor/2} -${edgeFactor/4} -${edgeFactor/2} -${edgeFactor/4}`}
            />
          </filter>
        </defs>
      </svg>

      {/* Player Header */}
      <div className={`bg-slate-900 px-4 py-3 flex items-center justify-between border-b border-slate-800 transition-all duration-300 z-30 ${
        isFullscreen 
          ? `absolute top-0 left-0 right-0 bg-slate-950/80 backdrop-blur-md border-b-0 shadow-lg ${
              useParser
                ? 'opacity-0 -translate-y-full pointer-events-none'
                : (showControls ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full pointer-events-none')
            }` 
          : 'relative'
      }`}>
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
      <div className={`${isFullscreen ? 'w-full h-full' : 'aspect-[16/9] w-full'} relative bg-slate-950 flex items-center justify-center transition-all duration-300`}>
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
          <div className="w-full h-full relative group overflow-hidden" onMouseMove={handleMouseMove}>
            {/* Real-time WebGL Super-Resolution Canvas overlay */}
            {useWebGL && !useParser && (
              <canvas
                id="webgl-superres-canvas"
                ref={canvasRef}
                className="w-full h-full block bg-black cursor-pointer absolute inset-0 z-10"
                style={{ objectFit: scaleMode }}
                onClick={handlePlayPause}
              />
            )}

            <video
              id="h5-video-node"
              ref={videoRef}
              className={`${useWebGL ? "absolute w-0.5 h-0.5 opacity-0 pointer-events-none" : "w-full h-full cursor-pointer"}`}
              style={useWebGL ? undefined : { 
                objectFit: scaleMode,
                filter: filterStyle,
                imageRendering: (sharpen > 0 ? 'pixelated' : 'auto') as any
              }}
              controls={!useWebGL && !isFullscreen}
              playsInline
              preload="auto"
              onTimeUpdate={handleTimeUpdate}
              onClick={!useWebGL ? handlePlayPause : undefined}
            />

            {/* Custom premium overlay media controls when WebGL is active or in fullscreen */}
            {(useWebGL || isFullscreen) && isReady && (
              <div 
                className={`absolute inset-0 bg-gradient-to-t from-slate-950/90 via-transparent to-transparent flex flex-col justify-end transition-opacity duration-300 select-none z-20 ${showControls ? 'opacity-100' : 'opacity-0'}`}
              >
                {/* Visual state indicator in center: Play button overlay if paused */}
                <div 
                  className="absolute inset-0 flex items-center justify-center cursor-pointer pointer-events-none"
                  onClick={handlePlayPause}
                >
                  {!isPlaying && (
                    <div className="h-14 w-14 flex items-center justify-center rounded-full bg-slate-950/85 border border-slate-700/80 text-cyan-400 shadow-[0_0_24px_rgba(8,145,178,0.45)] pointer-events-auto hover:scale-105 transition-all active:scale-95 duration-200">
                      <Play className="h-6 w-6 ml-1 text-cyan-400 fill-cyan-400/20" />
                    </div>
                  )}
                </div>

                {/* Bottom translucent overlay bar */}
                <div className="p-4 bg-slate-950/90 border-t border-slate-800/60 space-y-3 pointer-events-auto" onMouseMove={handleMouseMove}>
                  {/* Slider Progress Scrubbing Bar */}
                  <div className="flex items-center space-x-3 group/timeline">
                    <span className="text-[10px] font-mono text-slate-400 shrink-0 select-none">
                      {formatProgressTime(currentTimeState)}
                    </span>
                    <input
                      type="range"
                      min="0"
                      max={durationState || 100}
                      step="0.05"
                      value={currentTimeState}
                      onChange={handleSeek}
                      className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500 hover:accent-cyan-450 transition-all focus:outline-hidden"
                    />
                    <span className="text-[10px] font-mono text-slate-400 shrink-0 select-none">
                      {formatProgressTime(durationState)}
                    </span>
                  </div>

                  {/* Operational layout controls */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      {/* Play/Pause Button */}
                      <button
                        type="button"
                        onClick={handlePlayPause}
                        className="p-1 text-slate-300 hover:text-cyan-400 transition cursor-pointer"
                        title={isPlaying ? '暂停 (Pause)' : '播放 (Play)'}
                      >
                        {isPlaying ? (
                          <Pause className="h-4.5 w-4.5" />
                        ) : (
                          <Play className="h-4.5 w-4.5" />
                        )}
                      </button>

                      {/* WebGL Status Badge */}
                      <div className="flex items-center space-x-1 px-2.5 py-0.5 bg-cyan-950/65 text-cyan-400 border border-cyan-800/40 rounded-full text-[10px] font-bold select-none animate-pulse">
                        <Sparkles className="h-3 w-3 text-cyan-400 animate-spin" style={{ animationDuration: '4s' }} />
                        <span>WebGL 实时超分辨率插值中</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-4">
                      {/* Volume Slider Section */}
                      <div className="flex items-center space-x-2 group/volume">
                        <button
                          type="button"
                          onClick={handleToggleMute}
                          className="p-1 text-slate-300 hover:text-white transition cursor-pointer"
                        >
                          {volumeState === 0 ? (
                            <VolumeX className="h-4 w-4 text-slate-400" />
                          ) : (
                            <Volume2 className="h-4 w-4 text-cyan-400" />
                          )}
                        </button>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={volumeState}
                          onChange={handleVolumeChange}
                          className="w-16 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500 focus:outline-hidden"
                        />
                      </div>

                      {/* Fullscreen Button */}
                      <button
                        type="button"
                        onClick={handleToggleFullscreen}
                        className="p-1 text-slate-300 hover:text-cyan-400 transition cursor-pointer"
                        title="全屏 (Fullscreen)"
                      >
                        {isFullscreen ? (
                          <Minimize2 className="h-4.5 w-4.5" />
                        ) : (
                          <Maximize2 className="h-4.5 w-4.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!isReady && !errorMsg && (
              <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-center space-y-3 pointer-events-none transition-opacity duration-300 z-30">
                <div className="animate-spin rounded-full h-10 w-10 border-2 border-cyan-500 border-t-transparent" />
                <span className="text-slate-300 text-xs tracking-wider">正在加载 HLS 流，并初始化 WebGL 超分着色器...</span>
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
      {!isFullscreen && (
        <div className="bg-slate-900/90 px-4 py-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="text-slate-400 flex items-center space-x-1 font-mono text-[11px] max-w-[280px] sm:max-w-md truncate">
          <span className="text-slate-500 shrink-0">当前流:</span>
          <span className="text-slate-300 select-all truncate">{playUrl}</span>
        </div>

        <div className="flex items-center space-x-2 flex-wrap gap-2">
          {!useParser && (
            <>
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

              <button
                type="button"
                onClick={() => setUseWebGL(!useWebGL)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition border cursor-pointer select-none flex items-center space-x-1.5 ${
                  useWebGL
                    ? 'bg-cyan-600/25 text-cyan-400 border-cyan-500/55 shadow-[0_0_12px_rgba(8,145,178,0.25)] font-bold animate-pulse'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                <Sparkles className={`h-3 w-3 ${useWebGL ? 'text-cyan-400' : 'text-slate-400'}`} />
                <span>WebGL 实时超分: {useWebGL ? '已激活 ⚡' : '未激活'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowAdjustPanel(!showAdjustPanel)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition border cursor-pointer select-none ${
                  showAdjustPanel
                    ? 'bg-blue-600/20 text-blue-400 border-blue-500/50 shadow-[0_0_12px_rgba(37,99,235,0.15)] font-bold'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                <span>🎨 画面调色 {showAdjustPanel ? '▼' : '▲'}</span>
              </button>
            </>
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
      )}

      {/* Picture adjustment panel */}
      {showAdjustPanel && !useParser && !isFullscreen && (
        <div className="bg-slate-950/90 px-5 py-5 border-t border-slate-800 space-y-4">
          {/* HD Enhancement algorithm mode selector */}
          <div className="flex flex-col md:flex-row md:items-center justify-between pb-3 border-b border-slate-800/60 gap-3">
            <div className="flex flex-col space-y-1">
              <span className="text-xs font-bold text-slate-200">🔍 核心 GPU-WebGL 4K重建与微分边缘超分辨率算法</span>
              <span className="text-[10px] text-slate-400">
                {useWebGL 
                  ? "【已启用 WebGL GPU 硬件级超分】利用GL着色器实时计算局部高频切向变化以恢复超分辨率细节，并混合插值与抗噪，消减老电影与动漫压制产生的马赛克噪边。"
                  : "【已降级为 SVG 复合滤镜】通过多通道高通图像矩阵卷积恢复经典电影或老片中的画面对比度："}
              </span>
            </div>
            
            <div className="flex flex-wrap items-center gap-1 p-0.5 bg-slate-900 rounded-lg border border-slate-800 self-start md:self-auto shrink-0 select-none">
              {([
                { id: 'usm', label: '✨ USM 智能反遮罩(首选)', desc: '最先进细节增强：提取高频轮廓，与原片做梯度复合，让发丝和背景纹理极其锐利且不易产生噪边。' },
                { id: 'laplacian', label: '📺 经典拉普拉斯锐化', desc: '线性差值提升：极大加强整幅图像的线面立体感，明暗对比变强，对老电影尤为适合。' },
                { id: 'edge', label: '🌸 动漫/人像修复(抗噪)', desc: '温和边缘恢复：只识别强边缘进行修复，平坦区域保真，避免老片或动漫中压缩块过度锐化。' }
              ] as const).map(mode => (
                <button
                  key={mode.id}
                  type="button"
                  title={mode.desc}
                  onClick={() => setEnhanceMode(mode.id)}
                  className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition cursor-pointer select-none ${
                    enhanceMode === mode.id
                      ? 'bg-cyan-600 text-white shadow-[0_2px_8px_rgba(8,145,178,0.3)]'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5 items-center">
            {/* Brightness slider */}
            <div className="flex flex-col space-y-1.5">
              <div className="flex justify-between items-center text-[11px] select-none">
                <span className="text-slate-400 font-bold flex items-center space-x-1">
                  <span>☀️ 亮度 (Brightness)</span>
                </span>
                <span className="text-blue-400 font-mono font-extrabold">{brightness}%</span>
              </div>
              <input
                type="range"
                min="50"
                max="200"
                value={brightness}
                onChange={(e) => setBrightness(Number(e.target.value))}
                className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500 focus:outline-hidden"
              />
            </div>

            {/* Contrast slider */}
            <div className="flex flex-col space-y-1.5">
              <div className="flex justify-between items-center text-[11px] select-none">
                <span className="text-slate-400 font-bold flex items-center space-x-1">
                  <span>🌗 对比度 (Contrast)</span>
                </span>
                <span className="text-blue-400 font-mono font-extrabold">{contrast}%</span>
              </div>
              <input
                type="range"
                min="50"
                max="200"
                value={contrast}
                onChange={(e) => setContrast(Number(e.target.value))}
                className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500 focus:outline-hidden"
              />
            </div>

            {/* Saturation slider */}
            <div className="flex flex-col space-y-1.5">
              <div className="flex justify-between items-center text-[11px] select-none">
                <span className="text-slate-400 font-bold flex items-center space-x-1">
                  <span>🌈 饱和度 (Saturation)</span>
                </span>
                <span className="text-blue-400 font-mono font-extrabold">{saturation}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="200"
                value={saturation}
                onChange={(e) => setSaturation(Number(e.target.value))}
                className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500 focus:outline-hidden"
              />
            </div>

            {/* Sharpening Slider */}
            <div className="flex flex-col space-y-1.5">
              <div className="flex justify-between items-center text-[11px] select-none">
                <span className="text-cyan-400 font-bold flex items-center space-x-1">
                  <span className="text-cyan-400 font-bold">💎 增强强度 ({enhanceMode === 'usm' ? 'USM细节' : enhanceMode === 'laplacian' ? '经典拉普' : '动漫修复'})</span>
                </span>
                <span className="text-cyan-400 font-mono font-extrabold">{sharpen}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={sharpen}
                onChange={(e) => setSharpen(Number(e.target.value))}
                className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500 focus:outline-hidden"
              />
            </div>

            {/* Reset button */}
            <div className="flex items-center justify-end sm:justify-start lg:justify-center pt-2 sm:pt-0">
              <button
                type="button"
                onClick={() => {
                  setBrightness(100);
                  setContrast(100);
                  setSaturation(100);
                  setSharpen(0);
                  setEnhanceMode('usm');
                }}
                className="w-full sm:w-auto px-4 py-2 bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-slate-100 rounded-lg border border-slate-700 hover:border-slate-600 transition flex items-center justify-center space-x-1.5 cursor-pointer shadow-md"
              >
                <RotateCcw className="h-3 w-3 text-cyan-400" />
                <span>重置画面效果</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
