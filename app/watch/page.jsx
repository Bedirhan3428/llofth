'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import WatchDetailsView from '@/components/WatchDetailsView';

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
  const [initialTime, setInitialTime] = useState(targetTime);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (targetUrl) {
      setLoading(true);
      setError(null);

      // 1. Dizi ağacını çek
      fetch(`/api/series?url=${encodeURIComponent(targetUrl)}`)
        .then(res => res.json())
        .then(async (data) => {
          if (data.success && data.seasons?.length > 0) {
            setSeriesData(data);

            // Hedeflenen bölümü bul veya ilk bölümü seç
            let chosenEp = null;
            let chosenSeasonIdx = 0;
            let chosenEpIdx = 0;

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
            }

            if (!chosenEp) {
              chosenSeasonIdx = 0;
              chosenEpIdx = 0;
              chosenEp = data.seasons[0].episodes[0];
            }

            setActiveEpisode(chosenEp);
            setCurrentEpIdx(chosenEpIdx);
            setCurrentSeasonIdx(chosenSeasonIdx);
            setInitialTime(targetTime);

            // 2. Bölümün akışını çöz
            const resResolve = await fetch(`/api/resolve?pageUrl=${encodeURIComponent(chosenEp.url || targetUrl)}`);
            const resolveData = await resResolve.json();
            if (resolveData.success && resolveData.streamUrl) {
              setStreamUrl(resolveData.streamUrl);
            } else {
              setError(resolveData.error || 'Akış adresi çözülemedi.');
            }
          } else {
            setError('Dizi ayrıntıları yüklenemedi veya bölüm bulunamadı.');
          }
        })
        .catch(err => setError(err.message))
        .finally(() => setLoading(false));
    }
  }, [targetUrl, targetEpUrl, targetTime]);

  const handleSelectEpisode = async (ep, epIdx, seasonIdx) => {
    setActiveEpisode(ep);
    setCurrentEpIdx(epIdx);
    setCurrentSeasonIdx(seasonIdx);
    setInitialTime(0);
    setLoading(true);

    try {
      const res = await fetch(`/api/resolve?pageUrl=${encodeURIComponent(ep.url)}`);
      const data = await res.json();
      if (data.success && data.streamUrl) {
        setStreamUrl(data.streamUrl);
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
    if (currentEpIdx < season.episodes.length - 1) {
      const nextEp = season.episodes[currentEpIdx + 1];
      handleSelectEpisode(nextEp, currentEpIdx + 1, currentSeasonIdx);
    }
  };

  const handlePrevEpisode = () => {
    if (!seriesData) return;
    const season = seriesData.seasons[currentSeasonIdx];
    if (currentEpIdx > 0) {
      const prevEp = season.episodes[currentEpIdx - 1];
      handleSelectEpisode(prevEp, currentEpIdx - 1, currentSeasonIdx);
    }
  };

  if (loading && !seriesData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="loader-spin" style={{ width: 32, height: 32, borderWidth: 3 }}></div>
        <p className="text-xs text-zinc-400">llofth player yükleniyor...</p>
      </div>
    );
  }

  if (error && !seriesData) {
    return (
      <div className="max-w-md mx-auto my-16 p-6 bg-[#13141b] border border-white/10 rounded-xl text-center">
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
  const hasNext = currentSeason && currentEpIdx < currentSeason.episodes.length - 1;
  const hasPrev = currentSeason && currentEpIdx > 0;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
      <WatchDetailsView
        seriesData={seriesData}
        activeEpisode={activeEpisode}
        currentEpIdx={currentEpIdx}
        currentSeasonIdx={currentSeasonIdx}
        streamUrl={streamUrl}
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
