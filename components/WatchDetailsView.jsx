'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import CustomPlayer from '@/components/CustomPlayer';
import { saveWatchProgress, getEpisodeProgress, getAllSeriesEpisodeProgress } from '@/lib/history';
import { ArrowLeft, Calendar, Play, Tv, CheckCircle2, LayoutGrid, List, Star, Users, User, Download } from 'lucide-react';

export default function WatchDetailsView({
  seriesData,
  activeEpisode,
  currentEpIdx,
  currentSeasonIdx,
  streamUrl,
  subtitles = [],
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
  const [episodeProgressMap, setEpisodeProgressMap] = useState({});
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'grid'
  const [tmdbData, setTmdbData] = useState(null);
  const [loadingTmdb, setLoadingTmdb] = useState(false);
  const [download, setDownload] = useState(null);
  const downloadPollRef = useRef(null);

  const stopDownloadPoll = () => {
    if (downloadPollRef.current) {
      clearInterval(downloadPollRef.current);
      downloadPollRef.current = null;
    }
  };

  // Bölüm değişince indirme durumunu sıfırla
  useEffect(() => {
    stopDownloadPoll();
    setDownload(null);
    return stopDownloadPoll;
  }, [activeEpisode?.url]);

  const triggerFileDownload = (jobId) => {
    const a = document.createElement('a');
    a.href = `/api/download/file?id=${jobId}`;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleDownload = async () => {
    if (!activeEpisode?.url) return;
    if (download && !['error', 'delivered'].includes(download.status)) return;

    const seriesName = (seriesData?.title || '').split(/[\r\n]+/)[0].replace(/\s*izle.*$/i, '').trim();
    const seasonNo = seriesData?.seasons?.[currentSeasonIdx]?.seasonNumber || (currentSeasonIdx + 1);
    const episodeNo = activeEpisode.episodeNumber || (currentEpIdx + 1);
    const code = `S${String(seasonNo).padStart(2, '0')}E${String(episodeNo).padStart(2, '0')}`;
    const title = seriesName ? `${seriesName} - ${code}` : (activeEpisode.title || code);

    setDownload({ status: 'queued', progress: 0 });
    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageUrl: activeEpisode.url, title })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      const episodeUrl = activeEpisode.url;
      const applyJob = (job) => {
        if (job.status === 'done' || job.status === 'error' || job.status === 'delivered') {
          stopDownloadPoll();
          if (job.status === 'done') {
            triggerFileDownload(job.id);
            setDownload({ ...job, status: 'delivered' });
            return;
          }
        }
        setDownload(job);
      };

      applyJob(data.job);
      if (!['done', 'error', 'delivered'].includes(data.job.status)) {
        stopDownloadPoll();
        downloadPollRef.current = setInterval(async () => {
          try {
            const r = await fetch(`/api/download?id=${data.job.id}`);
            const d = await r.json();
            if (d.success && episodeUrl === activeEpisode.url) applyJob(d.job);
          } catch (e) {}
        }, 1000);
      }
    } catch (err) {
      setDownload({ status: 'error', progress: 0, error: err.message });
    }
  };

  const downloadLabel = (() => {
    if (!download) return 'İndir';
    switch (download.status) {
      case 'queued': return 'Sırada';
      case 'resolving': return 'Hazırlanıyor';
      case 'downloading': return `%${download.progress}`;
      case 'muxing': return 'Birleştiriliyor';
      case 'done':
      case 'delivered': return 'İndirildi';
      case 'error': return 'İndirme başarısız';
      default: return 'İndir';
    }
  })();
  const isDownloading = download && !['done', 'delivered', 'error'].includes(download.status);

  useEffect(() => {
    if (!seriesData?.title) return;
    setLoadingTmdb(true);
    // Başlığı temizle ve API'ye gönder (örnek: "The Mentalist izle\n (2008)" -> "The Mentalist")
    const cleanQuery = seriesData.title.split(/[\r\n]+/)[0].replace(/\s*izle.*$/i, '').trim() || seriesData.title;
    fetch(`/api/tmdb?title=${encodeURIComponent(cleanQuery)}`)
      .then(res => res.json())
      .then(resData => {
        if (resData.success && resData.data) {
          setTmdbData(resData.data);
        }
      })
      .catch(err => console.log('TMDb load error:', err.message))
      .finally(() => setLoadingTmdb(false));
  }, [seriesData?.title]);

  useEffect(() => {
    if (currentSeasonIdx !== undefined) {
      setSelectedSeasonIdx(currentSeasonIdx);
    }
  }, [currentSeasonIdx]);

  // Dizi değiştikçe veya bölüm geliştikçe tüm bölümlerin ilerleme haritasını güncelle
  const refreshEpisodeProgress = useCallback(() => {
    if (seriesData?.sourceUrl) {
      setEpisodeProgressMap(getAllSeriesEpisodeProgress(seriesData.sourceUrl));
    }
  }, [seriesData?.sourceUrl]);

  useEffect(() => {
    refreshEpisodeProgress();
  }, [refreshEpisodeProgress]);

  // Bölüm değiştiğinde SADECE o bölüme ait kaydedilmiş süreyi yükle
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
      // Haritayı hafifçe güncelle
      refreshEpisodeProgress();
    }
  }, [seriesData, activeEpisode, selectedSeasonIdx, currentEpIdx, refreshEpisodeProgress]);

  const formatEpisodeTitle = (title, seriesTitle, epNum) => {
    if (!title) return `${epNum}. Bölüm`;
    let clean = title;
    if (seriesTitle) {
      clean = clean.replace(new RegExp(`^${seriesTitle}\\s*[-–:]?\\s*`, 'i'), '');
    }
    clean = clean.replace(/\s*izle$/i, '').trim();
    return clean || `${epNum}. Bölüm`;
  };

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

      {/* İki Kolonlu Video & Bölüm Detay Düzeni */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start">
        {/* SOL ANA ALAN: Video Oynatıcı & Video Bilgileri (8 Kolon) */}
        <div className="lg:col-span-8 flex flex-col gap-3 sm:gap-4 min-w-0">
          {/* 16:9 Gömülü Video Oynatıcı */}
          <div className="w-full">
            {isLoadingStream ? (
              <div className="w-full aspect-video bg-[#13141b] rounded-none sm:rounded-2xl border-0 sm:border border-white/10 flex flex-col items-center justify-center gap-3">
                <div className="loader-spin" style={{ width: 28, height: 28, borderWidth: 3 }}></div>
                <p className="text-xs text-zinc-400 font-medium">Bölüm akışı hazırlanıyor, lütfen bekleyin...</p>
              </div>
            ) : streamUrl ? (
              <CustomPlayer
                streamUrl={streamUrl}
                subtitles={subtitles}
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

          {/* Video Altı Başlık, TMDb Bilgileri ve Oyuncular */}
          <div className="mx-3 sm:mx-0 p-3.5 sm:p-4 bg-[#13141b] border border-white/10 rounded-xl flex flex-col gap-3">
            {/* Üst Satır: Başlık & Önceki / Sonraki Butonları */}
            <div className="flex flex-col sm:flex-row justify-between items-start gap-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider bg-white/5 px-2 py-0.5 rounded border border-white/5">
                    {seriesData.title}
                  </span>
                  {tmdbData?.rating && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                      <Star size={10} fill="currentColor" /> {tmdbData.rating} TMDb
                      {tmdbData.voteCount ? (
                        <span className="text-[9px] text-amber-400/70 font-normal">({tmdbData.voteCount})</span>
                      ) : null}
                    </span>
                  )}
                  {tmdbData?.releaseDate && (
                    <span className="text-[10px] font-mono text-zinc-400 bg-white/5 px-1.5 py-0.5 rounded">
                      {tmdbData.releaseDate.substring(0, 4)}
                    </span>
                  )}
                  {tmdbData?.status && (
                    <span className="text-[10px] font-medium text-emerald-400/90 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      {tmdbData.status}
                    </span>
                  )}
                </div>

                <h1 className="text-base sm:text-lg md:text-xl font-bold text-white leading-snug truncate">
                  {activeEpisode?.title || 'Bölüm'}
                </h1>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start flex-shrink-0">
                <button
                  onClick={handleDownload}
                  disabled={!!isDownloading}
                  tabIndex={24}
                  title={download?.error || (download?.quality ? download.quality : undefined)}
                  className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors text-center tabular-nums ${
                    download?.status === 'error'
                      ? 'bg-red-500/10 text-red-300 border-red-500/30 hover:bg-red-500/20'
                      : 'bg-white/5 hover:bg-white/10 text-zinc-200 border-white/10'
                  } ${isDownloading ? 'cursor-wait opacity-90' : ''}`}
                >
                  {isDownloading ? (
                    <span className="loader-spin" style={{ width: 12, height: 12, borderWidth: 2 }}></span>
                  ) : (
                    <Download size={13} />
                  )}
                  <span>{downloadLabel}</span>
                </button>
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

            {/* Tür Etiketleri & Meta */}
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
              {tmdbData?.genres && tmdbData.genres.length > 0 && (
                <>
                  <span>•</span>
                  <div className="flex flex-wrap gap-1">
                    {tmdbData.genres.map((genre, gIdx) => (
                      <span key={`genre-${gIdx}`} className="text-[10px] font-medium text-zinc-300 bg-white/5 px-1.5 py-0.5 rounded border border-white/5">
                        {genre}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Konu / Özet (TMDb veya Scraper) */}
            <div className="border-t border-white/5 pt-2.5">
              {tmdbData?.tagline && (
                <p className="text-xs italic text-zinc-400 mb-1">
                  "{tmdbData.tagline}"
                </p>
              )}
              <p className="text-xs text-zinc-300 leading-relaxed">
                {tmdbData?.overview || seriesData.description || (loadingTmdb ? 'Dizi konusu yükleniyor...' : 'Açıklama bulunamadı.')}
              </p>
            </div>

            {/* TMDb Oyuncu Kadrosu (Cast) */}
            {tmdbData?.cast && tmdbData.cast.length > 0 ? (
              <div className="border-t border-white/5 pt-3">
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Users size={14} className="text-zinc-400" /> Oyuncular & Karakterler
                  </h3>
                  <span className="text-[10px] text-zinc-500 font-mono">TMDb</span>
                </div>

                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
                  {tmdbData.cast.map((actor) => (
                    <div
                      key={`cast-${actor.id}`}
                      className="flex flex-col items-center flex-shrink-0 w-20 sm:w-24 text-center group"
                    >
                      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden bg-[#181922] border border-white/10 mb-1.5 flex items-center justify-center flex-shrink-0 group-hover:border-white/30 transition-all shadow-md">
                        {actor.profilePath ? (
                          <img
                            src={actor.profilePath}
                            alt={actor.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            loading="lazy"
                          />
                        ) : (
                          <User size={24} className="text-zinc-500" />
                        )}
                      </div>
                      <span className="text-[11px] font-semibold text-zinc-200 group-hover:text-white truncate w-full">
                        {actor.name}
                      </span>
                      {actor.character && (
                        <span className="text-[9px] text-zinc-500 truncate w-full mt-0.5">
                          {actor.character}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : loadingTmdb ? (
              <div className="border-t border-white/5 pt-3 animate-pulse">
                <div className="h-3 w-28 bg-white/10 rounded mb-3"></div>
                <div className="flex gap-3 overflow-x-hidden">
                  {[1, 2, 3, 4, 5, 6].map(i => (
                    <div key={`skel-${i}`} className="flex flex-col items-center flex-shrink-0 w-20">
                      <div className="w-14 h-14 rounded-full bg-white/10 mb-1.5"></div>
                      <div className="h-2.5 w-16 bg-white/10 rounded mb-1"></div>
                      <div className="h-2 w-12 bg-white/5 rounded"></div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* SAĞ YAN ALAN: Sezonlar ve Bölüm Listesi (4 Kolon) */}
        <div className="mx-3 sm:mx-0 lg:col-span-4 bg-[#13141b] border border-white/10 rounded-xl p-3.5 sm:p-4 flex flex-col gap-3 min-w-0 shadow-lg">
          <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
            <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Tv size={14} className="text-zinc-400" /> Bölüm Listesi
            </span>
            
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-zinc-400 font-mono bg-white/5 px-2 py-0.5 rounded border border-white/5">
                {currentSeason.episodeCount || currentSeason.episodes?.length || 0} Bölüm
              </span>

              {/* Görünüm Değiştirici: Liste veya Izgara */}
              <div className="flex items-center bg-white/5 rounded-lg p-0.5 border border-white/5">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  title="Detaylı Liste Görünümü"
                  className={`p-1 rounded-md transition-colors ${
                    viewMode === 'list'
                      ? 'bg-white text-black'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <List size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  title="Kompakt Izgara Görünümü"
                  className={`p-1 rounded-md transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-white text-black'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <LayoutGrid size={13} />
                </button>
              </div>
            </div>
          </div>

          {/* Sezon Seçici Sekmeler */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none">
            {seriesData.seasons.map((season, sIdx) => {
              const isSelected = sIdx === selectedSeasonIdx;
              return (
                <button
                  key={`watch-season-${sIdx}`}
                  onClick={() => setSelectedSeasonIdx(sIdx)}
                  tabIndex={30 + sIdx}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors outline-none ${
                    isSelected
                      ? 'bg-white text-black font-bold shadow-sm'
                      : 'bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-zinc-200 border border-white/5'
                  }`}
                >
                  {season.seasonTitle}
                </button>
              );
            })}
          </div>

          {/* Bölüm Listesi İçeriği */}
          {viewMode === 'list' ? (
            /* 1. DETAYLI LİSTE GÖRÜNÜMÜ (Kesinlikle içiçe geçmez, shrink-0 ve min-h garantili) */
            <div className="flex flex-col gap-2 overflow-y-auto max-h-[540px] lg:max-h-[620px] pr-1.5 pb-4">
              {currentSeason.episodes.map((ep, epIdx) => {
                const isCurrentPlaying = activeEpisode?.url === ep.url;
                const epProg = episodeProgressMap[ep.url];
                const isEpFinished = epProg?.isFinished;
                const hasEpProgress = epProg && epProg.currentTime > 5 && !isEpFinished;

                return (
                  <button
                    key={`ep-item-${ep.url}-${epIdx}`}
                    onClick={() => onSelectEpisode(ep, epIdx, selectedSeasonIdx)}
                    tabIndex={50 + epIdx}
                    className={`group relative flex flex-col justify-center w-full min-h-[58px] shrink-0 p-3 rounded-xl text-left transition-all border outline-none ${
                      isCurrentPlaying
                        ? 'bg-white/15 border-white/30 text-white font-semibold shadow-md'
                        : 'bg-[#181922] hover:bg-[#20212d] border-white/5 hover:border-white/15 text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2.5 w-full min-w-0">
                      {/* Sol Kısım: Bölüm Numarası + Başlık */}
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span
                          className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-mono font-bold flex-shrink-0 transition-colors ${
                            isCurrentPlaying
                              ? 'bg-white text-black shadow-sm'
                              : isEpFinished
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-white/10 text-zinc-400 group-hover:bg-white/15 group-hover:text-zinc-200'
                          }`}
                        >
                          {ep.episodeNumber}
                        </span>

                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs sm:text-sm font-medium text-zinc-200 group-hover:text-white truncate block">
                            {formatEpisodeTitle(ep.title, seriesData?.title, ep.episodeNumber)}
                          </h4>
                          {ep.date && (
                            <span className="text-[10px] text-zinc-500 font-mono block truncate mt-0.5">
                              {ep.date}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Sağ Kısım: Durum Rozeti */}
                      <div className="flex items-center flex-shrink-0 ml-1">
                        {isCurrentPlaying ? (
                          <span className="text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded text-[10px] uppercase font-bold flex items-center gap-1 shadow-sm">
                            <Play size={10} fill="currentColor" /> Çalıyor
                          </span>
                        ) : isEpFinished ? (
                          <span className="text-emerald-400/90 bg-emerald-500/10 px-2 py-0.5 rounded text-[10px] flex items-center gap-1 font-semibold border border-emerald-500/20">
                            <CheckCircle2 size={11} /> İzlendi
                          </span>
                        ) : hasEpProgress ? (
                          <span className="text-zinc-400 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold">
                            %{epProg.progressPercent}
                          </span>
                        ) : (
                          <span className="text-zinc-400 group-hover:text-white text-xs font-medium px-2 py-1 rounded bg-white/5 group-hover:bg-white/10 border border-white/5 transition-colors">
                            Oynat
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Bölüm İlerleme Çubuğu */}
                    {hasEpProgress && !isCurrentPlaying && (
                      <div className="w-full bg-white/10 h-1 rounded-full overflow-hidden mt-2.5">
                        <div
                          className="bg-emerald-400 h-full rounded-full transition-all"
                          style={{ width: `${epProg.progressPercent}%` }}
                        />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            /* 2. KOMPAKT IZGARA GÖRÜNÜMÜ (24 bölümü tek ekranda pratik seçme) */
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-4 gap-2 overflow-y-auto max-h-[540px] lg:max-h-[620px] pr-1 pb-4">
              {currentSeason.episodes.map((ep, epIdx) => {
                const isCurrentPlaying = activeEpisode?.url === ep.url;
                const epProg = episodeProgressMap[ep.url];
                const isEpFinished = epProg?.isFinished;
                const hasEpProgress = epProg && epProg.currentTime > 5 && !isEpFinished;

                return (
                  <button
                    key={`ep-grid-${ep.url}-${epIdx}`}
                    onClick={() => onSelectEpisode(ep, epIdx, selectedSeasonIdx)}
                    tabIndex={50 + epIdx}
                    title={`${ep.episodeNumber}. Bölüm - ${ep.title}`}
                    className={`relative flex flex-col items-center justify-center h-12 rounded-xl transition-all border outline-none font-mono ${
                      isCurrentPlaying
                        ? 'bg-white text-black font-bold shadow-md border-white'
                        : isEpFinished
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25'
                        : hasEpProgress
                        ? 'bg-[#1e202e] text-white border-white/20 hover:border-white/40'
                        : 'bg-[#181922] hover:bg-[#20212d] text-zinc-300 border-white/5 hover:border-white/20'
                    }`}
                  >
                    <span className="text-xs font-bold">{ep.episodeNumber}</span>
                    {isCurrentPlaying ? (
                      <span className="text-[9px] uppercase font-bold tracking-tighter text-black">Çalıyor</span>
                    ) : isEpFinished ? (
                      <CheckCircle2 size={10} className="text-emerald-400 mt-0.5" />
                    ) : hasEpProgress ? (
                      <span className="text-[9px] text-zinc-400 font-sans">%{epProg.progressPercent}</span>
                    ) : (
                      <span className="text-[9px] text-zinc-500">Bölüm</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
