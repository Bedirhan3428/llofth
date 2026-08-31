'use client';

import { Star, Play } from 'lucide-react';

export default function VideoCard({ item, onClick, tabIndex }) {
  const fallbackPoster = 'https://via.placeholder.com/300x450/181922/ffffff?text=Resim';

  return (
    <button
      onClick={() => onClick(item)}
      tabIndex={tabIndex}
      className="group relative flex flex-col text-left bg-[#13141b] border border-white/5 rounded-lg overflow-hidden cursor-pointer hover:border-white/20 transition-all duration-150 outline-none"
    >
      {/* Thumbnail */}
      <div className="relative w-full aspect-[2/3] bg-zinc-900 overflow-hidden">
        <img
          src={item.poster || fallbackPoster}
          alt={item.title}
          onError={(e) => { e.currentTarget.src = fallbackPoster; }}
          className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-200"
        />

        {/* Hover Play Icon */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-white/90 text-black flex items-center justify-center shadow">
            <Play size={18} fill="currentColor" className="ml-0.5" />
          </div>
        </div>

        {/* Badges */}
        <div className="absolute top-2 left-2 right-2 flex justify-between items-center pointer-events-none">
          <span className="bg-black/70 backdrop-blur-sm text-zinc-300 text-[10px] font-semibold px-1.5 py-0.5 rounded border border-white/10">
            {item.type || (item.url?.includes('/dizi/') ? 'Dizi' : 'Film')}
          </span>

          {item.imdb && (
            <span className="bg-black/70 backdrop-blur-sm text-amber-300 text-[10px] font-semibold px-1.5 py-0.5 rounded border border-white/10 flex items-center gap-0.5">
              <Star size={10} fill="#fcd34d" />
              {item.imdb}
            </span>
          )}
        </div>

        {/* Year */}
        {item.year && (
          <div className="absolute bottom-2 right-2 pointer-events-none">
            <span className="bg-black/70 backdrop-blur-sm text-zinc-300 text-[10px] font-mono px-1.5 py-0.5 rounded border border-white/10">
              {item.year}
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-2.5">
        <h3 className="font-medium text-xs text-zinc-200 line-clamp-1 group-hover:text-white transition-colors">
          {item.title}
        </h3>
      </div>
    </button>
  );
}
