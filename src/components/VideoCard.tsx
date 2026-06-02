import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Film, Play, Star, Sparkles } from 'lucide-react';
import { VideoItem } from '../types';

interface VideoCardProps {
  video: VideoItem;
  onClick: () => void;
}

// Deterministic review rating generator to mimic IMDb/Emby style
const getRating = (name: string): string => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const score = 7.5 + (Math.abs(hash) % 21) / 10;
  return score.toFixed(1);
};

// Helper to detect video quality from remarks and name
const parseQuality = (remarks: string = '', name: string = '') => {
  const text = (remarks + ' ' + name).toLowerCase();
  
  if (text.includes('4k') || text.includes('2160p') || text.includes('极清') || text.includes('uhd')) {
    return {
      label: '4K',
      bgClass: 'bg-gradient-to-r from-amber-500 to-yellow-500 text-zinc-950 font-extrabold',
    };
  }
  if (text.includes('蓝光') || text.includes('bd') || text.includes('bluray') || text.includes('blu-ray')) {
    return {
      label: '蓝光',
      bgClass: 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-bold',
    };
  }
  if (text.includes('高清') || text.includes('hd') || text.includes('1080p') || text.includes('720p') || text.includes('超清') || text.includes('1080i') || text.includes('hdtv')) {
    let specificLabel = '高清';
    if (text.includes('1080p')) {
      specificLabel = '1080P';
    } else if (text.includes('hd')) {
      specificLabel = 'HD';
    } else if (text.includes('超清')) {
      specificLabel = '超清';
    }
    return {
      label: specificLabel,
      bgClass: 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white font-bold',
    };
  }
  
  // Custom fallback checks for other qualities if present
  if (text.includes('dvd') || text.includes('dvdrip')) {
    return {
      label: 'DVD',
      bgClass: 'bg-zinc-800 text-zinc-300 font-bold border border-zinc-750',
    };
  }
  if (text.includes('ts') || text.includes('tc') || text.includes('hc') || text.includes('枪版') || text.includes('抢先')) {
    return {
      label: '抢先版',
      bgClass: 'bg-rose-950 text-rose-300 border border-rose-900/40 font-bold',
    };
  }

  // Elegant fallback
  return {
    label: 'HD',
    bgClass: 'bg-gradient-to-r from-zinc-800 to-zinc-900 text-zinc-300 border border-zinc-700/30 font-medium',
  };
};

export default function VideoCard({ video, onClick }: VideoCardProps) {
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  // Initials for beautiful fallback cards
  const titleInitials = video.name ? video.name.charAt(0) : '影';

  const getGradientClass = (name: string) => {
    const code = name.charCodeAt(0) % 4;
    switch (code) {
      case 0: return 'from-rose-950 via-zinc-950 to-zinc-900';
      case 1: return 'from-teal-950 via-zinc-950 to-zinc-900';
      case 2: return 'from-indigo-950 via-zinc-950 to-zinc-900';
      default: return 'from-purple-950 via-zinc-950 to-zinc-900';
    }
  };

  return (
    <motion.div
      id={`vid-card-${video.id}`}
      whileHover={{ y: -4, scale: 1.025, transition: { duration: 0.25, ease: 'easeOut' } }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="group cursor-pointer transition-all duration-300 flex flex-col space-y-2 h-full relative"
    >
      {/* Thumbnail Container */}
      <div className="aspect-[16/9] w-full bg-zinc-950 relative rounded-xl overflow-hidden shadow-lg group-hover:shadow-xl group-hover:shadow-red-950/15 transition-all duration-300 border border-zinc-900/60 group-hover:border-zinc-800/80 shrink-0">
        
        {/* Brand visual monogram - Netflix/Nimbus styled "N" badge on Top-Left */}
        <div className="absolute top-2.5 left-2.5 z-20 flex items-center justify-center">
          <span className="text-[10px] font-sans font-bold bg-black/75 text-red-650 px-1.5 py-0.5 rounded border border-white/5 shrink-0 shadow-sm">
            赛
          </span>
        </div>

        {/* Quality status badges */}
        {(() => {
          const q = parseQuality(video.remarks, video.name);
          return (
            <div className="absolute top-2.5 right-2.5 z-15 flex items-center gap-1">
              <span className={`text-[9px] tracking-wide px-1.5 py-0.5 rounded shadow-sm ${q.bgClass}`}>
                {q.label}
              </span>
            </div>
          );
        })()}

        {/* Remarks label */}
        {video.remarks && (
          <div className="absolute bottom-2.5 left-2.5 z-15">
            <span className="text-[9px] font-sans font-extrabold bg-red-650/90 text-white px-2 py-0.5 rounded-sm shadow-md tracking-wider">
              {video.remarks}
            </span>
          </div>
        )}

        {/* Play overlay hover mask with animated icon */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center z-10">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="h-10 w-10 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg transform duration-200"
          >
            <Play className="h-4.5 w-4.5 fill-white ml-0.5" />
          </motion.div>
        </div>

        {/* Image source rendering */}
        {!imgError && video.pic ? (
          <>
            <img
              src={video.pic}
              alt={video.name}
              referrerPolicy="no-referrer"
              onLoad={() => setImgLoaded(true)}
              onError={() => {
                setImgError(true);
                setImgLoaded(false);
              }}
              className={`w-full h-full object-cover group-hover:scale-104 transition-transform duration-500 ease-out ${
                imgLoaded ? 'opacity-90 saturate-[1.1] contrast-[1.05]' : 'opacity-0'
              }`}
            />
            {!imgLoaded && (
              <div className="absolute inset-0 bg-zinc-900 animate-pulse flex items-center justify-center">
                <Film className="h-6 w-6 text-zinc-800 animate-pulse" />
              </div>
            )}
          </>
        ) : (
          /* Dynamic gradient placeholder */
          <div className={`w-full h-full bg-gradient-to-br ${getGradientClass(video.name)} p-4 flex flex-col justify-between text-white relative`}>
            <div className="absolute right-1 bottom-1 text-white/5 font-extrabold text-5xl select-none pointer-events-none font-sans">
              CYB
            </div>
            <div className="flex justify-between items-start">
              <span className="text-white/40 text-[8px] tracking-widest uppercase font-mono">CYBER VOD</span>
              <Film className="h-4 w-4 text-white/30" />
            </div>
            <div className="flex flex-col space-y-1">
              <div className="h-7 w-7 rounded bg-white/10 flex items-center justify-center border border-white/15 select-none">
                <span className="text-xs font-bold font-sans text-red-500">{titleInitials}</span>
              </div>
              <h4 className="text-xs font-bold leading-tight line-clamp-1 mt-1 text-zinc-200">
                {video.name}
              </h4>
            </div>
          </div>
        )}
      </div>

      {/* Meta text and labels info underneath (matching the second reference picture visually) */}
      <div className="px-1 py-1 flex flex-col space-y-0.5 text-left flex-grow">
        <div className="flex items-center justify-between gap-1.5">
          <h3 className="text-xs sm:text-sm font-bold text-zinc-100 group-hover:text-red-500 transition-colors line-clamp-1 leading-snug font-sans tracking-wide">
            {video.name}
          </h3>
          <div className="flex items-center gap-0.5 text-amber-500 shrink-0">
            <Star className="h-3 w-3 fill-amber-500 stroke-none" />
            <span className="text-[10px] font-extrabold font-mono">{getRating(video.name)}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-zinc-400 font-light truncate">
          {video.category && <span>{video.category}</span>}
          {(video.category && video.year) && <span className="text-zinc-700 select-none">·</span>}
          {video.year && <span>{video.year}</span>}
          {(video.year && video.area) && <span className="text-zinc-700 select-none">·</span>}
          {video.area && <span className="truncate">{video.area}</span>}
        </div>
      </div>
    </motion.div>
  );
}
