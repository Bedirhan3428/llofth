'use client';

import { useState, useEffect, useCallback } from 'react';
import CustomPlayer from '@/components/CustomPlayer';
import { saveWatchProgress, getEpisodeProgress } from '@/lib/history';
import { ArrowLeft, Calendar, Play, Tv } from 'lucide-react';

export default function WatchDetailsView({
  seriesData,
  activeEpisode,
  currentEpIdx,
  currentSeasonIdx,
  streamUrl,
  isLoadingStream,
  initialTime = 0,
  onSelectEpisode,
  onNextEpisode,
  onPrevEpisode,
  hasNext,
  hasPrev,
  onBack
}) {
  const [selectedSeasonIdx, setSelectedSeasonIdx] = useState(currentSeasonIdx || 0);
  const [resumeTime, setResumeTime] = useState(initialTime);

  useEffect(() => {
    if (currentSeasonIdx !== undefined) {
      setSelectedSeasonIdx(currentSeasonIdx);
    }
  }, [currentSeasonIdx]);

  // Bölüm değiştiğinde kaydedilmiş ilerleme süresini bul
  useEffect(() => {
    if (seriesData && activeEpisode) {
      const saved = getEpisodeProgress(seriesData.sourceUrl, activeEpisode.url);
      if (saved && saved.currentTime > 5 && !saved.isFinished) {
        setResumeTime(saved.currentTime);
      } else if (initialTime > 5) {
        setResumeTime(initialTime);
      } else {
        setResumeTime(0);
      }
    }
  }, [seriesData, activeEpisode, initialTime]);

  const handleProgressUpdate = useCallback(({ currentTime, duration }) => {
    if (seriesData && activeEpisode) {
      const currentSeason = seriesData.seasons?.[selectedSeasonIdx];
      saveWatchProgress({
        seriesUrl: seriesData.sourceUrl,
        seriesTitle: seriesData.title,
        episodeUrl: activeEpisode.url,
        episodeTitle: activeEpisode.title,
        seasonNumber: currentSeason?.seasonNumber || (selectedSeasonIdx + 1),
        episodeNumber: activeEpisode.episodeNumber || (currentEpIdx + 1),
        seasonIdx: selectedSeasonIdx,
        epIdx: currentEpIdx,
        poster: seriesData.poster,
        currentTime,
        duration
      });
    }
  }, [seriesData, activeEpisode, selectedSeasonIdx, currentEpIdx]);

  if (!seriesData) return null;

  const currentSeason = seriesData.seasons?.[selectedSeasonIdx] || { episodes: [] };

  return (
    <div className="w-full">
      {/* Üst Geri Dön Çubuğu */}
      <div className="flex items-center justify-between mb-2.5 sm:mb-4 px-3 sm:px-0 pt-2 sm:pt-0">
        <button
          onClick={onBack}
          tabIndex={20}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-xs font-semibold border border-white/10 transition-colors outline-none"
        >
          <ArrowLeft size={14} />
          <span>Geri Dön</span>
        </button>

        <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-zinc-400 truncate max-w-[180px] sm:max-w-md">
          <span className="truncate">{seriesData.title}</span>
          <span>•</span>
          <span className="text-white font-medium truncate">{activeEpisode?.title}</span>
        </div>
      </div>

      {/* YouTube Tarzı İki Kolonlu Video & Bölüm Detay Düzeni */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-6 items-start">
        {/* SOL ANA ALAN: Video Oynatıcı & Video Bilgileri (8 Kolon) */}
        <div className="lg:col-span-8 flex flex-col gap-3 sm:gap-4">
          {/* 16:9 Gömülü Video Oynatıcı (Mobilde kenardan kenara tam genişlik) */}
          <div className="w-full">
            {isLoadingStream ? (
              <div className="w-full aspect-video bg-[#13141b] rounded-none sm:rounded-2xl border-0 sm:border border-white/10 flex flex-col items-center justify-center gap-3">
                <div className="loader-spin" style={{ width: 28, height: 28, borderWidth: 3 }}></div>
                <p className="text-xs text-zinc-400 font-medium">Bölüm akışı hazırlanıyor, lütfen bekleyin...</p>
              </div>
            ) : streamUrl ? (
              <CustomPlayer
                streamUrl={streamUrl}
                title={`${seriesData.title} - ${activeEpisode?.title}`}
                initialTime={resumeTime}
                onProgressUpdate={handleProgressUpdate}
                onNextEpisode={onNextEpisode}
                onPrevEpisode={onPrevEpisode}
                hasNext={hasNext}
                hasPrev={hasPrev}
              />
            ) : (
              <div className="w-full aspect-video bg-[#13141b] rounded-none sm:rounded-2xl border-0 sm:border border-white/10 flex items-center justify-center text-xs text-zinc-400">
                Oynatılacak akış seçilmedi.
              </div>
            )}
          </div>

          {/* Video Altı Başlık ve Bilgiler */}
          <div className="mx-3 sm:mx-0 p-3.5 sm:p-4 bg-[#13141b] border border-white/10 rounded-xl">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-2.5 mb-2.5">
              <div>
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider bg-white/5 px-2 py-0.5 rounded border border-white/5 mb-1 inline-block">
                  {seriesData.title}
                </span>
                <h1 className="text-base sm:text-lg md:text-xl font-bold text-white leading-snug">
                  {activeEpisode?.title || 'Bölüm'}
                </h1>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
                {hasPrev && (
                  <button
                    onClick={onPrevEpisode}
                    tabIndex={25}
                    className="flex-1 sm:flex-initial px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold text-zinc-300 border border-white/10 transition-colors text-center"
                  >
                    ◀ Önceki
                  </button>
                )}
                {hasNext && (
                  <button
                    onClick={onNextEpisode}
                    tabIndex={26}
                    className="flex-1 sm:flex-initial px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-xs font-semibold text-white border border-white/10 transition-colors text-center"
                  >
                    Sonraki ▶
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[11px] sm:text-xs text-zinc-400 pt-2 border-t border-white/5">
              {activeEpisode?.date && (
                <span className="flex items-center gap-1">
                  <Calendar size={11} /> {activeEpisode.date}
                </span>
              )}
              <span>•</span>
              <span>{seriesData.totalSeasons} Sezon / {seriesData.totalEpisodes} Bölüm</span>
              <span>•</span>
              <span className="text-emerald-400">Canlı HLS Akışı</span>
            </div>

            {seriesData.description && (
              <p className="text-xs text-zinc-400 mt-2.5 leading-relaxed border-t border-white/5 pt-2">
                {seriesData.description}
              </p>
            )}
          </div>
        </div>

        {/* SAĞ YAN ALAN: Sezonlar ve Bölüm Listesi (4 Kolon - YouTube Playlist Tarzı) */}
        <div className="mx-3 sm:mx-0 lg:col-span-4 bg-[#13141b] border border-white/10 rounded-xl p-3 sm:p-3.5 flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Tv size={14} /> Bölüm Listesi
            </span>
            <span className="text-[11px] text-zinc-400 font-mono">
              {currentSeason.episodeCount} Bölüm
            </span>
          </div>

          {/* Sezon Seçici Sekmeler */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-none">
            {seriesData.seasons.map((season, sIdx) => {
              const isSelected = sIdx === selectedSeasonIdx;
              return (
                <button
                  key={`watch-season-${sIdx}`}
                  onClick={() => setSelectedSeasonIdx(sIdx)}
                  tabIndex={30 + sIdx}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap transition-colors outline-none ${
                    isSelected
                      ? 'bg-white text-black font-bold'
                      : 'bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-zinc-200 border border-white/5'
                  }`}
                >
                  {season.seasonTitle}
                </button>
              );
            })}
          </div>

          {/* Dikey Kaydırılabilir Bölüm Kartları */}
          <div className="flex flex-col gap-1.5 max-h-[360px] sm:max-h-[580px] overflow-y-auto pr-1">
            {currentSeason.episodes.map((ep, epIdx) => {
              const isCurrentPlaying = activeEpisode?.url === ep.url;
              return (
                <button
                  key={`ep-item-${ep.url}-${epIdx}`}
                  onClick={() => onSelectEpisode(ep, epIdx, selectedSeasonIdx)}
                  tabIndex={50 + epIdx}
                  className={`flex items-center justify-between p-2.5 rounded-lg text-left transition-colors border outline-none ${
                    isCurrentPlaying
                      ? 'bg-white/15 border-white/30 text-white font-semibold shadow-sm'
                      : 'bg-[#181922] hover:bg-[#20212d] border-white/5 hover:border-white/15 text-zinc-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <span className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-mono flex-shrink-0 ${
                      isCurrentPlaying ? 'bg-white text-black font-bold' : 'bg-white/10 text-zinc-400'
                    }`}>
                      {ep.episodeNumber}
                    </span>
                    <span className="text-xs truncate">
                      {ep.title}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 text-[11px] font-mono flex-shrink-0 ml-2">
                    {isCurrentPlaying ? (
                      <span className="text-emerald-400 text-[10px] uppercase font-bold flex items-center gap-0.5">
                        <Play size={10} fill="currentColor" /> Çalıyor
                      </span>
                    ) : (
                      <span className="text-zinc-500 hover:text-zinc-300 text-xs">
                        Oynat
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
