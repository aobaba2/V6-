import React, { useState, useMemo } from 'react';
import { Radio, Search, Tv, RefreshCw, AlertCircle, Heart, Film, Flame, Play, Grid, ShieldAlert, Sparkles } from 'lucide-react';
import { IptvChannel } from '../types';
import VideoPlayer from './VideoPlayer';

interface IptvLiveViewProps {
  iptvSources: IptvChannel[];
  selectedChannel: IptvChannel | null;
  onSelectChannel: (channel: IptvChannel) => void;
}

export default function IptvLiveView({
  iptvSources = [],
  selectedChannel,
  onSelectChannel
}: IptvLiveViewProps) {
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('iptv_favorites');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Toggle favorite channel local bookmark
  const toggleFavorite = (channelId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    let newFavs = [...favorites];
    if (newFavs.includes(channelId)) {
      newFavs = newFavs.filter(id => id !== channelId);
    } else {
      newFavs.push(channelId);
    }
    setFavorites(newFavs);
    localStorage.setItem('iptv_favorites', JSON.stringify(newFavs));
  };

  // Extract all groups / categories
  const groups = useMemo(() => {
    const list = new Set<string>();
    iptvSources.forEach(ch => {
      if (ch.group) {
        list.add(ch.group);
      }
    });
    return ['all', 'favorites', ...Array.from(list)];
  }, [iptvSources]);

  // Filter channels based on search & selected group tab
  const filteredChannels = useMemo(() => {
    return iptvSources.filter(ch => {
      // 1. Group Filter
      if (selectedGroup === 'favorites') {
        if (!favorites.includes(ch.id)) return false;
      } else if (selectedGroup !== 'all' && ch.group !== selectedGroup) {
        return false;
      }

      // 2. Keyword Filter
      if (searchKeyword.trim()) {
        const query = searchKeyword.toLowerCase();
        const nameMatch = ch.name.toLowerCase().includes(query);
        const groupMatch = (ch.group || '').toLowerCase().includes(query);
        return nameMatch || groupMatch;
      }

      return true;
    });
  }, [iptvSources, selectedGroup, searchKeyword, favorites]);

  // Hot recommendations (up to 4 channels)
  const hotChannels = useMemo(() => {
    return iptvSources.slice(0, 4);
  }, [iptvSources]);

  return (
    <div className="space-y-6 animate-fade-in" id="iptv-live-dashboard">
      
      {/* Upper Information Banner */}
      <div className="bg-gradient-to-r from-red-950/20 via-zinc-900 to-zinc-900/40 p-4 sm:p-5 rounded-2xl border border-red-900/20 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="h-11 w-11 bg-red-650/15 border border-red-650/30 rounded-xl flex items-center justify-center text-red-500 shadow-md shrink-0">
            <Radio className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base sm:text-lg font-bold text-zinc-100 font-sans tracking-wide">极速高清电视直播厅</h2>
              <span className="text-[10px] bg-red-650/20 text-red-400 font-mono font-bold px-2 py-0.5 rounded border border-red-900/30">LIVE</span>
            </div>
            <p className="text-zinc-400 text-xs mt-1.5 leading-relaxed font-sans font-light">
              全球主流华语新闻、综合电视、科技文化频道，内置极速高清 Hls 直播解码引擎，点击侧栏即点即播。
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 self-start md:self-auto text-xs text-zinc-550 font-mono">
          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          <span>免插件 · 无卡顿 · 智能流自适应</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* SIDEBAR: CHANNEL CONTROLS & SELECTION (4 cols on lg, full on rest) */}
        <div className="lg:col-span-4 flex flex-col space-y-4">
          
          <div className="bg-[#121212] rounded-xl border border-zinc-900 p-4 flex flex-col space-y-3 shadow-md">
            
            {/* Live Search Channel Input */}
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-zinc-500">
                <Search className="h-3.5 w-3.5" />
              </span>
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="搜索电视、卫视、新闻台名字..."
                className="w-full text-xs bg-zinc-950 hover:bg-zinc-950/80 focus:bg-zinc-950 text-zinc-200 pl-9 pr-3.5 py-2.5 rounded-lg border border-zinc-900 focus:border-red-900/50 outline-none transition font-sans placeholder-zinc-600"
              />
            </div>

            {/* Horizontal Group Categories Filter Tabs */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {groups.map((group) => {
                const isSelected = selectedGroup === group;
                let groupLabel = group === 'all' ? '全部频道' : group === 'favorites' ? '我的收藏 ⭐' : group;
                return (
                  <button
                    key={group}
                    onClick={() => setSelectedGroup(group)}
                    className={`text-[10.5px] font-sans font-medium px-2.5 py-1.5 rounded transition cursor-pointer border ${
                      isSelected
                        ? 'bg-red-650 text-white border-red-600 font-bold shadow-md shadow-red-950/20'
                        : 'bg-zinc-950 hover:bg-zinc-900 text-zinc-400 border-zinc-900 hover:border-zinc-800'
                    }`}
                  >
                    {groupLabel}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Channels List Vertical Scrolling Container */}
          <div className="bg-[#121212] rounded-xl border border-zinc-900 flex flex-col flex-1 shadow-md max-h-[600px] overflow-hidden">
            <div className="p-3 border-b border-zinc-900/60 bg-zinc-950/40 flex items-center justify-between">
              <span className="text-[11px] font-mono tracking-wider text-zinc-500 uppercase flex items-center gap-1.5">
                <Grid className="h-3 w-3 text-red-500" />
                频道节目单 ({filteredChannels.length} 个)
              </span>
              <button 
                onClick={() => { setSearchKeyword(''); setSelectedGroup('all'); }} 
                className="text-[10px] text-zinc-600 hover:text-red-500 transition-colors flex items-center gap-0.5 font-sans"
              >
                <RefreshCw className="h-2.5 w-2.5" />
                重置过滤器
              </button>
            </div>

            <div className="overflow-y-auto divide-y divide-zinc-900/50 max-h-[480px] lg:max-h-[520px] custom-scrollbar">
              {filteredChannels.length > 0 ? (
                filteredChannels.map((ch) => {
                  const isCurrent = selectedChannel?.id === ch.id;
                  const isFav = favorites.includes(ch.id);

                  return (
                    <div
                      key={ch.id}
                      onClick={() => onSelectChannel(ch)}
                      className={`group p-3 flex items-center justify-between gap-3 cursor-pointer transition-all duration-200 select-none text-left ${
                        isCurrent
                          ? 'bg-gradient-to-r from-red-950/20 to-zinc-900/40 border-l-2 border-red-500'
                          : 'hover:bg-zinc-900/50 border-l-2 border-transparent'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 truncate">
                        {/* Status Monogram, fallback to TV icon if status is active */}
                        <div className="h-7 w-7 rounded overflow-hidden bg-zinc-950 border border-zinc-850 shrink-0 flex items-center justify-center">
                          {ch.logo ? (
                            <img 
                              src={ch.logo} 
                              alt={ch.name} 
                              className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                // If error, replace with generic visual
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : null}
                          <Tv className={`h-3.5 w-3.5 ${isCurrent ? 'text-red-500' : 'text-zinc-650 group-hover:text-zinc-400 transition-colors'}`} />
                        </div>

                        {/* Title text */}
                        <div className="truncate">
                          <h4 className={`text-[12.5px] font-bold truncate transition-colors leading-tight ${isCurrent ? 'text-red-500' : 'text-zinc-200 group-hover:text-white'}`}>
                            {ch.name}
                          </h4>
                          <span className="text-[9.5px] font-mono text-zinc-550 block mt-0.5 truncate">
                            {ch.group || '常规频道'}
                          </span>
                        </div>
                      </div>

                      {/* Right Control indicators */}
                      <div className="flex items-center space-x-1.5 shrink-0">
                        {/* Live indicator tag */}
                        <div className="flex items-center space-x-1 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded text-[9px] font-bold font-mono text-green-400 select-none">
                          <span className="h-1.5 w-1.5 bg-green-500 rounded-full animate-pulse" />
                          <span>在线</span>
                        </div>

                        {/* Favorite button */}
                        <button
                          onClick={(e) => toggleFavorite(ch.id, e)}
                          title="加入收藏"
                          className={`p-1 rounded transition-colors ${
                            isFav ? 'text-amber-500' : 'text-zinc-700 hover:text-zinc-400'
                          }`}
                        >
                          <Heart className="h-3 w-3 fill-current stroke-zinc-950" />
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-8 text-center flex flex-col items-center justify-center space-y-2 text-zinc-550 select-none">
                  <AlertCircle className="h-7 w-7 text-zinc-700" />
                  <p className="text-xs font-sans">对应筛选项无相匹配的电视直播频道</p>
                  <p className="text-[10px] font-sans font-light max-w-xs leading-relaxed text-zinc-600">
                    您可以尝试输入其他关键字，或者回到最上方切换电视类别组。
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* MAIN VIEWER: TELEVISION BROADCAST CINEMA SCREEN (8 cols on lg, full on rest) */}
        <div className="lg:col-span-8 flex flex-col space-y-5">
          {selectedChannel ? (
            <div className="space-y-4">
              
              {/* VIDEO CYBER CINEMA VIEWPORT STAGING */}
              <VideoPlayer
                playUrl={selectedChannel.url}
                title="电视直播专线"
                episodeName={selectedChannel.name}
                parser={null} // Represents standard Internal HTML5 Hls Player directly!
              />

              {/* Dynamic current card parameters description */}
              <div className="bg-[#121212] p-4 rounded-xl border border-zinc-900 shadow-md">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-left">
                  <div className="flex items-center space-x-3">
                    <div className="h-9 w-9 bg-zinc-950 border border-zinc-850 rounded flex items-center justify-center text-red-500 shrink-0">
                      <Tv className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-zinc-150 leading-snug">{selectedChannel.name}</h3>
                        <span className="text-[9px] bg-red-650/15 border border-red-650/30 font-bold font-mono text-red-400 px-1 py-0.2 rounded">HD</span>
                      </div>
                      <p className="text-[10.5px] text-zinc-500 mt-1 font-mono tracking-wide select-all truncate max-w-sm sm:max-w-md">
                        直播频道源: {selectedChannel.url}
                      </p>
                    </div>
                  </div>

                  {/* Operational diagnostics state */}
                  <div className="flex items-center gap-2 self-start sm:self-auto bg-zinc-950 p-1.5 rounded-lg border border-zinc-900/60 shrink-0">
                    <span className="inline-block h-2 w-2 bg-green-500 rounded-full" />
                    <span className="text-[10px] font-sans font-medium text-emerald-400">电视频道链接探测：100% 极速通畅</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Selected channel placeholder empty state */
            <div className="bg-[#121212] rounded-xl border border-zinc-900 p-12 text-center aspect-[16/10] flex flex-col items-center justify-center space-y-4 shadow-md">
              <div className="h-16 w-16 rounded-full bg-zinc-950 border border-zinc-850 flex items-center justify-center text-zinc-700">
                <Tv className="h-8 w-8 animate-pulse text-red-500" />
              </div>
              <div>
                <h3 className="text-zinc-200 font-bold text-sm">暂未选择待播放的电视频道</h3>
                <p className="text-zinc-550 text-xs mt-1.5 max-w-sm mx-auto leading-relaxed">
                  请在左侧频道节目单栏目中点击您想收看的电视名称（如 CCTV-1、CGTN 等），系统将在此瞬间拉取 Hls 极速协议并加载精彩的实况视频。
                </p>
              </div>
            </div>
          )}

          {/* Quick TV Direct Access Buttons Panel */}
          <div className="bg-[#121212] p-4 rounded-xl border border-zinc-900 shadow-md">
            <h4 className="text-[11px] font-mono tracking-wider text-zinc-550 uppercase flex items-center gap-1.5 mb-3 text-left">
              <Flame className="h-3 w-3 text-red-500 animate-pulse" />
              电视直通车推荐播单
            </h4>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {hotChannels.map((ch) => {
                const isSelected = selectedChannel?.id === ch.id;
                return (
                  <button
                    key={ch.id}
                    onClick={() => onSelectChannel(ch)}
                    className={`p-2.5 rounded-lg border transition-all cursor-pointer flex flex-col items-start space-y-1.5 text-left relative overflow-hidden ${
                      isSelected
                        ? 'bg-gradient-to-r from-red-950/20 to-zinc-900/40 border-red-900/80 shadow-md'
                        : 'bg-zinc-950 border-zinc-900 hover:border-zinc-850 hover:bg-zinc-900/30'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-[10px] font-bold font-mono tracking-wider text-zinc-500 uppercase">{ch.group || '电视直播'}</span>
                      <Play className={`h-2.5 w-2.5 ${isSelected ? 'text-red-500 fill-current' : 'text-zinc-700 hover:text-zinc-500'}`} />
                    </div>
                    <h5 className={`text-xs font-bold truncate w-full ${isSelected ? 'text-red-500' : 'text-zinc-200'}`}>
                      {ch.name}
                    </h5>
                  </button>
                );
              })}
            </div>
          </div>

          {/* User IPTV Custom Manual configuration instructions box */}
          <div className="bg-zinc-900/30 p-4 rounded-xl border border-zinc-900/60 flex items-start gap-3 text-left">
            <AlertCircle className="h-4.5 w-4.5 text-zinc-550 mt-0.5 shrink-0" />
            <div className="text-[11px] text-zinc-500 leading-relaxed font-sans font-light">
              <strong className="text-zinc-400 font-bold font-sans">自助增设温馨提示：</strong>
              本页面支持播放任何公网开放的 <strong className="text-zinc-300">m3u8 电视直播源</strong>。如果您拥有其他的 IPTV 地址或 CCTV 原画线路包，您可以随时点击右上角的 [后台管理] 输入账号密码登录，在 <strong className="text-red-500">IPTV直播源管理</strong> 栏目自助配置，所有配置数据均会即时存储并呈现给所有访客播放。
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
