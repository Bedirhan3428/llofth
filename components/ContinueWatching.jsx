'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getWatchHistory, removeFromWatchHistory } from '@/lib/history';
import { Play, RotateCcw, X, Clock } from 'lucide-react';

export default function ContinueWatching() {
  const router = useRouter();
  const [historyItems, setHistoryItems] = useState([]);

  const loadHistory = () => {
    const list = getWatchHistory().filter(item => !item.isFinished && item.currentTime > 5);
    setHistoryItems(list);
  };

  useEffect(() => {
    loadHistory();
  }, []);

  if (historyItems.length === 0) return null;

  const handleResume = (item) => {
    router.push(
      `/watch?url=${encodeURIComponent(item.seriesUrl)}&epUrl=${encodeURIComponent(item.episodeUrl)}&t=${item.currentTime}`
    );
  };

  const handleRemove = (e, item) => {
    e.stopPropagation();
    removeFromWatchHistory(item.seriesUrl);
    loadHistory();
  };

  const formatRemainingTime = (cur, dur) => {
    const rem = dur - cur;
    if (rem <= 0) return '';
    const mins = Math.floor(rem / 60);
    return `${mins} dk kaldı`;
  };

  return (
    <section className="mb-9">
      <div className="flex items-center justify-between mb-3.5">
        <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-1.5">
          <RotateCcw size={15} className="text-zinc-400" />
          <span>İzlemeye Devam Et</span>
        </h2>
        <span className="text-xs text-zinc-500 font-mono">
          {historyItems.length} içerik
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {historyItems.map((item, idx) => (
          <div
            key={`history-${item.seriesUrl}-${idx}`}
            onClick={() => handleResume(item)}
            tabIndex={10 + idx}
            className="group relative bg-[#13141b] border border-white/10 rounded-xl overflow-hidden cursor-pointer hover:border-white/20 transition-all text-left outline-none"
          >
            {/* Top Thumbnail with Progress Overlay */}
            <div className="relative w-full aspect-video bg-zinc-900 overflow-hidden">
              <img
                src={item.poster || 'https://via.placeholder.com/400x225/181922/ffffff?text=Video'}
                alt={item.seriesTitle}
                className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-200"
              />

              {/* Hover Play Icon */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity flex items-center justify-center">
                <div className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center shadow">
                  <Play size={18} fill="currentColor" className="ml-0.5" />
                </div>
              </div>

              {/* Remove Dismiss Button */}
              <button
                onClick={(e) => handleRemove(e, item)}
                className="absolute top-2 right-2 p-1 rounded-md bg-black/70 hover:bg-red-600 text-zinc-300 hover:text-white transition-colors"
                title="Listeden Kaldır"
              >
                <X size={13} />
              </button>

              {/* Episode Tag */}
              <div className="absolute bottom-2 left-2 pointer-events-none">
                <span className="bg-black/80 backdrop-blur-sm text-zinc-200 text-[10px] font-mono px-2 py-0.5 rounded border border-white/10">
                  {item.seasonNumber}. Sezon {item.episodeNumber}. Bölüm
                </span>
              </div>

              {/* Progress Bar */}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                <div
                  style={{ width: `${item.progressPercent}%` }}
                  className="h-full bg-white"
                />
              </div>
            </div>

            {/* Info */}
            <div className="p-3 flex justify-between items-center">
              <div className="truncate mr-2">
                <h3 className="font-semibold text-xs text-white truncate">
                  {item.seriesTitle}
                </h3>
                <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                  {item.episodeTitle}
                </p>
              </div>

              <div className="flex items-center gap-1 text-[11px] text-zinc-400 font-mono flex-shrink-0">
                <Clock size={11} />
                <span>{formatRemainingTime(item.currentTime, item.duration)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
