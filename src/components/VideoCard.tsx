import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Film, PlayCircle, Star, Tv } from 'lucide-react';
import { VideoItem } from '../types';

interface VideoCardProps {
  video: VideoItem;
  onClick: () => void;
}

export default function VideoCard({ video, onClick }: VideoCardProps) {
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  // Generate initials for the placeholder card
  const titleInitials = video.name ? video.name.charAt(0) : '影';

  // Choose a clean random-looking background gradient based on the video's title
  const getGradientClass = (name: string) => {
    const code = name.charCodeAt(0) % 4;
    switch (code) {
      case 0: return 'from-indigo-650 to-blue-600';
      case 1: return 'from-emerald-600 to-teal-700';
      case 2: return 'from-rose-650 to-orange-600';
      default: return 'from-violet-600 to-purple-850';
    }
  };

  return (
    <motion.div
      id={`vid-card-${video.id}`}
      whileHover={{ y: -6, transition: { duration: 0.18, ease: 'easeOut' } }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="group bg-[#141414] rounded-xl overflow-hidden shadow-lg hover:shadow-2xl cursor-pointer transition-shadow border border-zinc-900 flex flex-col h-full"
    >
      {/* Thumbnail Aspect Container */}
      <div className="aspect-[3/4] w-full bg-zinc-950 relative overflow-hidden shrink-0">
        {/* Status badges */}
        <div className="absolute top-2.5 left-2.5 z-10 flex flex-col gap-1">
          <span className="text-[10px] font-semibold tracking-wide bg-black/75 backdrop-blur-md text-zinc-300 px-2 py-0.5 rounded-md border border-white/10 shrink-0">
            {video.category || '电影'}
          </span>
        </div>

        {video.remarks && (
          <div className="absolute bottom-2 right-2 z-10">
            <span className="text-[10px] font-sans font-extrabold bg-red-600/95 backdrop-blur-xs text-white px-1.5 py-0.5 rounded-sm shadow-md">
              {video.remarks}
            </span>
          </div>
        )}

        {/* Play hover mask */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center z-10">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            whileHover={{ scale: 1.05 }}
            animate={{ scale: 1, opacity: 1 }}
            className="h-11 w-11 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg transform duration-150"
          >
            <PlayCircle className="h-6 w-6 stroke-[2.5]" />
          </motion.div>
        </div>

        {/* Thumbnail Image */}
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
              className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ${
                imgLoaded ? 'opacity-100' : 'opacity-0'
              }`}
            />
            {!imgLoaded && (
              <div className="absolute inset-0 bg-zinc-900 animate-pulse flex items-center justify-center">
                <Film className="h-8 w-8 text-zinc-700 animate-bounce" />
              </div>
            )}
          </>
        ) : (
          /* Dynamic beautiful gradient placeholder card if imageUrl fails */
          <div className={`w-full h-full bg-gradient-to-br ${getGradientClass(video.name)} p-5 flex flex-col justify-between text-white relative`}>
            {/* Background texture watermark */}
            <div className="absolute right-2 bottom-2 text-white/5 font-bold text-7xl select-none pointer-events-none">
              VOD
            </div>
            
            <div className="flex justify-between items-start">
              <span className="text-white/40 text-[10px] font-mono tracking-widest uppercase">CMS COLLECTION</span>
              <Film className="h-5 w-5 text-white/50" />
            </div>

            <div className="flex flex-col space-y-1">
              <div className="h-10 w-10 rounded-lg bg-white/10 flex items-center justify-center border border-white/20 select-none">
                <span className="text-lg font-bold font-sans">{titleInitials}</span>
              </div>
              <h4 className="text-sm font-bold tracking-tight line-clamp-2 mt-2 leading-tight">
                {video.name}
              </h4>
            </div>
          </div>
        )}
      </div>

      {/* Info details */}
      <div className="p-3 flex flex-col justify-between flex-grow">
        <div>
          <h3 className="text-xs sm:text-sm font-bold text-zinc-100 group-hover:text-red-500 transition-colors line-clamp-1 leading-snug">
            {video.name}
          </h3>
          
          {/* Release Year and Country/Area / Lang */}
          {(video.year || video.area || video.lang) && (
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[10px] text-zinc-500 font-medium">
              {video.year && (
                <span className="px-1 py-0.5 bg-zinc-900 rounded text-zinc-350 text-[10px] font-sans border border-zinc-800">
                  {video.year}
                </span>
              )}
              {video.area && (
                <span className="truncate max-w-[80px]" title={video.area}>
                  {video.area}
                </span>
              )}
              {video.area && video.lang && <span className="text-zinc-800 select-none">·</span>}
              {video.lang && (
                <span className="truncate max-w-[70px] text-zinc-500 text-[10px]" title={video.lang}>
                  {video.lang}
                </span>
              )}
            </div>
          )}
        </div>
        
        {/* Secondary text if long content descriptions are loaded */}
        <p className="text-[11px] text-zinc-500 mt-2 line-clamp-1 font-sans">
          {video.content ? video.content.replace(/<[^>]*>/g, '').trim() : '暂无详细介绍...'}
        </p>
      </div>
    </motion.div>
  );
}
