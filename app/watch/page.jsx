'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import WatchDetailsView from '@/components/WatchDetailsView';
import { getSeriesProgress, getEpisodeProgress } from '@/lib/history';

function WatchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const targetUrl = searchParams.get('url') || searchParams.get('pageUrl') || 'https://www.hdfilmcehennemi.nl/dizi/the-mentalist-izle-7/';
  const targetEpUrl = searchParams.get('epUrl');
  const targetTime = parseInt(searchParams.get('t') || '0', 10);

  const [seriesData, setSeriesData] = useState(null);
  const [activeEpisode, setActiveEpisode] = useState(null);
  const [currentEpIdx, setCurrentEpIdx] = useState(0);
  const [currentSeasonIdx, setCurrentSeasonIdx] = useState(0);
  const [streamUrl, setStreamUrl] = useState('');
  const [subtitles, setSubtitles] = useState([]);
  const [initialTime, setInitialTime] = useState(targetTime);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!targetUrl) return;

    setLoading(true);
    setError(null);

    // 1. Dizi ağacını çek
    fetch(`/api/series?url=${encodeURIComponent(targetUrl)}`)
      .then(res => res.json())
      .then(async (data) => {
        if (data.success && data.seasons?.length > 0) {
          setSeriesData(data);

          let chosenEp = null;
          let chosenSeasonIdx = 0;
          let chosenEpIdx = 0;
          let startAt = 0;

          // Senaryo A: URL'de açıkça epUrl verilmişse (İzlemeye Devam Et kartından veya direkt bağlantıdan tıklandı)
          if (targetEpUrl) {
            data.seasons.forEach((season, sIdx) => {
              season.episodes.forEach((ep, eIdx) => {
                if (ep.url === targetEpUrl) {
                  chosenEp = ep;
                  chosenSeasonIdx = sIdx;
                  chosenEpIdx = eIdx;
                }
              });
            });

            if (chosenEp) {
              if (targetTime > 0) {
                startAt = targetTime;
              } else {
                const epSaved = getEpisodeProgress(targetUrl, chosenEp.url);
                startAt = (epSaved && epSaved.currentTime > 5 && !epSaved.isFinished) ? epSaved.currentTime : 0;
              }
            }
          }

          // Senaryo B: URL'de epUrl YOK (Ana sayfa kartından, arama sayfasından veya sadece dizi linkinden gelindi)
          // Kaydedilmiş son izlenen bölüme otomatik geç!
          if (!chosenEp) {
            const seriesHist = getSeriesProgress(targetUrl);
            if (seriesHist) {
              const lastEpUrl = seriesHist.lastEpisodeUrl || seriesHist.episodeUrl;
              let foundSIdx = -1;
              let foundEIdx = -1;

              data.seasons.forEach((season, sIdx) => {
                season.episodes.forEach((ep, eIdx) => {
                  if (ep.url === lastEpUrl) {
                    foundSIdx = sIdx;
                    foundEIdx = eIdx;
                  }
                });
              });

              if (foundSIdx !== -1 && foundEIdx !== -1) {
                const lastEp = data.seasons[foundSIdx].episodes[foundEIdx];
                const lastEpProg = getEpisodeProgress(targetUrl, lastEp.url);

                // Eğer son izlenen bölüm bitmişse (>%92), sonraki bölüme otomatik geç
                if (lastEpProg?.isFinished || seriesHist.isFinished) {
                  const curSeasonEps = data.seasons[foundSIdx].episodes;
                  if (foundEIdx < curSeasonEps.length - 1) {
                    // Aynı sezonun sonraki bölümü
                    chosenSeasonIdx = foundSIdx;
                    chosenEpIdx = foundEIdx + 1;
                    chosenEp = curSeasonEps[chosenEpIdx];
                    startAt = 0;
                  } else if (foundSIdx < data.seasons.length - 1 && data.seasons[foundSIdx + 1].episodes?.length > 0) {
                    // Sonraki sezonun 1. bölümü
                    chosenSeasonIdx = foundSIdx + 1;
                    chosenEpIdx = 0;
                    chosenEp = data.seasons[chosenSeasonIdx].episodes[0];
                    startAt = 0;
                  } else {
                    // Tüm dizi bitmişse son bölümde kal
                    chosenSeasonIdx = foundSIdx;
                    chosenEpIdx = foundEIdx;
                    chosenEp = lastEp;
                    startAt = 0;
                  }
                } else {
                  // Son izlenen bölüm bitmemişse, o bölümün kaldığı saniyesinden devam et
                  chosenSeasonIdx = foundSIdx;
                  chosenEpIdx = foundEIdx;
                  chosenEp = lastEp;
                  startAt = (lastEpProg && lastEpProg.currentTime > 5) ? lastEpProg.currentTime : (seriesHist.currentTime > 5 ? seriesHist.currentTime : 0);
                }
              }
            }
          }

          // Senaryo C: Hiç izlenmemişse 1. Sezon 1. Bölümden başla
          if (!chosenEp) {
            chosenSeasonIdx = 0;
            chosenEpIdx = 0;
            chosenEp = data.seasons[0].episodes[0];
            startAt = 0;
          }

          setActiveEpisode(chosenEp);
          setCurrentEpIdx(chosenEpIdx);
          setCurrentSeasonIdx(chosenSeasonIdx);
          setInitialTime(startAt);

          // 2. Bölümün akışını çöz
          const resResolve = await fetch(`/api/resolve?pageUrl=${encodeURIComponent(chosenEp.url || targetUrl)}`);
          const resolveData = await resResolve.json();
          if (resolveData.success && resolveData.streamUrl) {
            setStreamUrl(resolveData.streamUrl);
            setSubtitles(resolveData.subtitles || []);
          } else {
            setError(resolveData.error || 'Akış adresi çözülemedi.');
          }
        } else {
          setError('Dizi ayrıntıları yüklenemedi veya bölüm bulunamadı.');
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [targetUrl, targetEpUrl, targetTime]);

  const handleSelectEpisode = async (ep, epIdx, seasonIdx) => {
    setActiveEpisode(ep);
    setCurrentEpIdx(epIdx);
    setCurrentSeasonIdx(seasonIdx);
    
    // Yalnızca BU bölüme ait kaydedilmiş ilerlemeyi al
    const epSaved = getEpisodeProgress(targetUrl, ep.url);
    const startAt = (epSaved && epSaved.currentTime > 5 && !epSaved.isFinished) ? epSaved.currentTime : 0;
    setInitialTime(startAt);
    setLoading(true);

    try {
      const res = await fetch(`/api/resolve?pageUrl=${encodeURIComponent(ep.url)}`);
      const data = await res.json();
      if (data.success && data.streamUrl) {
        setStreamUrl(data.streamUrl);
        setSubtitles(data.subtitles || []);
      } else {
        alert(data.error || 'Akış çözülemedi.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleNextEpisode = () => {
    if (!seriesData) return;
    const season = seriesData.seasons[currentSeasonIdx];
    if (season && currentEpIdx < season.episodes.length - 1) {
      const nextEp = season.episodes[currentEpIdx + 1];
      handleSelectEpisode(nextEp, currentEpIdx + 1, currentSeasonIdx);
    } else if (currentSeasonIdx < seriesData.seasons.length - 1 && seriesData.seasons[currentSeasonIdx + 1]?.episodes?.length > 0) {
      // Sezonlar arası sonraki bölüme geçiş
      const nextSeasonIdx = currentSeasonIdx + 1;
      const nextEp = seriesData.seasons[nextSeasonIdx].episodes[0];
      handleSelectEpisode(nextEp, 0, nextSeasonIdx);
    }
  };

  const handlePrevEpisode = () => {
    if (!seriesData) return;
    if (currentEpIdx > 0) {
      const season = seriesData.seasons[currentSeasonIdx];
      const prevEp = season.episodes[currentEpIdx - 1];
      handleSelectEpisode(prevEp, currentEpIdx - 1, currentSeasonIdx);
    } else if (currentSeasonIdx > 0 && seriesData.seasons[currentSeasonIdx - 1]?.episodes?.length > 0) {
      // Sezonlar arası önceki bölüme geçiş
      const prevSeasonIdx = currentSeasonIdx - 1;
      const prevSeason = seriesData.seasons[prevSeasonIdx];
      const lastEpIdx = prevSeason.episodes.length - 1;
      const prevEp = prevSeason.episodes[lastEpIdx];
      handleSelectEpisode(prevEp, lastEpIdx, prevSeasonIdx);
    }
  };

  if (loading && !seriesData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 px-4">
        <div className="loader-spin" style={{ width: 32, height: 32, borderWidth: 3 }}></div>
        <p className="text-xs text-zinc-400">llofth player yükleniyor...</p>
      </div>
    );
  }

  if (error && !seriesData) {
    return (
      <div className="max-w-md mx-auto my-12 p-5 sm:p-6 bg-[#13141b] border border-white/10 rounded-xl text-center mx-4 sm:mx-auto">
        <h2 className="text-sm font-bold text-red-400 mb-2">Akış Başlatılamadı</h2>
        <p className="text-xs text-zinc-400 mb-4">{error}</p>
        <button
          onClick={() => router.push('/home')}
          className="px-4 py-2 bg-white/10 hover:bg-white/15 text-xs text-white rounded-lg transition-colors"
        >
          Ana Sayfaya Dön
        </button>
      </div>
    );
  }

  const currentSeason = seriesData?.seasons?.[currentSeasonIdx];
  const hasNext = !!(
    seriesData?.seasons &&
    (
      (currentSeason && currentEpIdx < currentSeason.episodes.length - 1) ||
      (currentSeasonIdx < seriesData.seasons.length - 1 && seriesData.seasons[currentSeasonIdx + 1]?.episodes?.length > 0)
    )
  );
  const hasPrev = !!(
    seriesData?.seasons &&
    (
      currentEpIdx > 0 ||
      (currentSeasonIdx > 0 && seriesData.seasons[currentSeasonIdx - 1]?.episodes?.length > 0)
    )
  );

  return (
    <div className="p-0 sm:p-4 md:p-8 max-w-7xl mx-auto w-full min-w-0">
      <WatchDetailsView
        seriesData={seriesData}
        activeEpisode={activeEpisode}
        currentEpIdx={currentEpIdx}
        currentSeasonIdx={currentSeasonIdx}
        streamUrl={streamUrl}
        subtitles={subtitles}
        initialTime={initialTime}
        isLoadingStream={loading}
        onSelectEpisode={handleSelectEpisode}
        onNextEpisode={handleNextEpisode}
        onPrevEpisode={handlePrevEpisode}
        hasNext={hasNext}
        hasPrev={hasPrev}
        onBack={() => router.push('/home')}
      />
    </div>
  );
}

export default function WatchPage() {
  return (
    <Suspense fallback={
      <div className="flex justify-center p-16">
        <div className="loader-spin" style={{ width: 32, height: 32, borderWidth: 3 }}></div>
      </div>
    }>
      <WatchContent />
    </Suspense>
  );
}
