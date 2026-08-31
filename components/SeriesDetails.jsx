'use client';

import { useState, useEffect } from 'react';
import { Layers, Calendar, Play, X, Check } from 'lucide-react';

export default function SeriesDetails({ seriesData, onPlayEpisode, resolvingUrl, onClose }) {
  const [selectedSeasonIdx, setSelectedSeasonIdx] = useState(0);

  useEffect(() => {
    setSelectedSeasonIdx(0);
  }, [seriesData?.sourceUrl]);

  if (!seriesData) return null;

  const currentSeason = seriesData.seasons?.[selectedSeasonIdx] || { episodes: [] };

  return (
    <div className="relative w-full bg-[#13141b] border border-white/10 rounded-xl p-5 md:p-6 mb-8">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row gap-5 items-start mb-6">
        {seriesData.poster && (
          <img
            src={seriesData.poster}
            alt={seriesData.title}
            className="w-24 sm:w-32 aspect-[2/3] object-cover rounded-lg border border-white/10 flex-shrink-0"
          />
        )}

        <div className="flex-1">
          <div className="flex justify-between items-start">
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
              {seriesData.title}
            </h2>
            {onClose && (
              <button
                onClick={onClose}
                tabIndex={30}
                className="p-1.5 rounded-md hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2 mb-3">
            <span className="bg-white/5 text-zinc-300 text-xs px-2.5 py-0.5 rounded border border-white/10">
              {seriesData.totalSeasons} Sezon
            </span>
            <span className="bg-white/5 text-zinc-300 text-xs px-2.5 py-0.5 rounded border border-white/10">
              {seriesData.totalEpisodes} Bölüm
            </span>
            <span className="bg-emerald-500/10 text-emerald-400 text-xs px-2.5 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1">
              <Check size={12} /> {seriesData.cached ? 'Önbellek' : 'Canlı'}
            </span>
          </div>

          <p className="text-zinc-400 text-xs sm:text-sm leading-relaxed line-clamp-3">
            {seriesData.description || 'İzlemek istediğiniz bölümü seçin.'}
          </p>
        </div>
      </div>

      {/* Season Tabs */}
      <div className="mb-4">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2">
          {seriesData.seasons.map((season, sIdx) => {
            const isActive = sIdx === selectedSeasonIdx;
            return (
              <button
                key={`season-tab-${season.seasonNumber}-${sIdx}`}
                onClick={() => setSelectedSeasonIdx(sIdx)}
                tabIndex={40 + sIdx}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors outline-none ${
                  isActive
                    ? 'bg-white text-black'
                    : 'bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-zinc-200 border border-white/5'
                }`}
              >
                <Layers size={13} />
                <span>{season.seasonTitle} ({season.episodeCount})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Episodes Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
        {currentSeason.episodes.map((ep, epIdx) => {
          const isResolvingThis = resolvingUrl === ep.url;
          return (
            <button
              key={`${ep.url}-${epIdx}`}
              onClick={() => onPlayEpisode(ep, epIdx, selectedSeasonIdx)}
              disabled={isResolvingThis}
              tabIndex={60 + epIdx}
              className="flex flex-col justify-between p-3 bg-[#181922] hover:bg-[#20212d] border border-white/5 hover:border-white/20 rounded-lg text-left transition-colors outline-none"
            >
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[11px] font-mono text-zinc-400 font-semibold">
                    Bölüm {ep.episodeNumber}
                  </span>
                  {ep.date && (
                    <span className="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
                      <Calendar size={10} /> {ep.date}
                    </span>
                  )}
                </div>
                <h4 className="text-zinc-200 font-medium text-xs line-clamp-1 mb-2.5">
                  {ep.title}
                </h4>
              </div>

              <div className="flex items-center gap-1 text-xs font-semibold text-zinc-300">
                {isResolvingThis ? (
                  <span className="flex items-center gap-1 text-amber-400">
                    <span className="loader-spin"></span>
                    <span>Çözülüyor...</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <Play size={12} fill="currentColor" />
                    <span>Oynat</span>
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
