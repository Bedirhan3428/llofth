'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import VideoCard from '@/components/VideoCard';
import ContinueWatching from '@/components/ContinueWatching';
import { Compass, Flame, Play, Sparkles, Tv, Film } from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const [featuredItems, setFeaturedItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadHomeFeed() {
      try {
        const mentalistRes = await fetch('/api/search?q=The%20Mentalist').then(r => r.json());
        const bbRes = await fetch('/api/search?q=Breaking%20Bad').then(r => r.json());
        const duneRes = await fetch('/api/search?q=Dune').then(r => r.json());
        const gotRes = await fetch('/api/search?q=Game%20of%20Thrones').then(r => r.json());

        const combined = [
          ...(Array.isArray(mentalistRes) ? mentalistRes.slice(0, 3) : []),
          ...(Array.isArray(bbRes) ? bbRes.slice(0, 3) : []),
          ...(Array.isArray(duneRes) ? duneRes.slice(0, 3) : []),
          ...(Array.isArray(gotRes) ? gotRes.slice(0, 3) : []),
        ];

        const unique = [];
        const seenUrls = new Set();
        for (const item of combined) {
          if (item && item.url && !seenUrls.has(item.url)) {
            seenUrls.add(item.url);
            unique.push(item);
          }
        }

        setFeaturedItems(unique);
      } catch (err) {
        console.error('Home feed error:', err);
      } finally {
        setLoading(false);
      }
    }

    loadHomeFeed();
  }, []);

  const handleCardClick = (item) => {
    router.push(`/watch?url=${encodeURIComponent(item.url)}`);
  };

  const heroItem = featuredItems[0];

  return (
    <div className="p-5 md:p-8 max-w-7xl mx-auto w-full">
      {/* Header */}
      <header className="flex justify-between items-center mb-6 pb-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold tracking-wider text-white lowercase">
            llofth
          </span>
          <span className="text-xs text-zinc-500 font-mono">• ana sayfa</span>
        </div>

        <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1 rounded-full text-xs text-zinc-300">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span>0.0.0.0:23504 Aktif</span>
        </div>
      </header>

      {/* 1. İZLEMEYE DEVAM ET (Kaldığın Yerden Devam Etme Bölümü) */}
      <ContinueWatching />

      {/* 2. Öne Çıkan Hero Vitrin Banner */}
      {heroItem && (
        <div className="relative w-full bg-[#13141b] border border-white/10 rounded-2xl p-6 md:p-8 mb-9 overflow-hidden flex flex-col md:flex-row gap-6 items-center justify-between shadow-xl">
          <div className="flex-1 z-10">
            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest bg-white/5 border border-white/10 px-2.5 py-1 rounded-md mb-2.5 inline-block">
              Öne Çıkan Dizi
            </span>
            <h1 className="text-2xl md:text-4xl font-extrabold text-white mb-2 tracking-tight">
              {heroItem.title}
            </h1>
            <p className="text-xs md:text-sm text-zinc-400 max-w-xl mb-5 leading-relaxed">
              Yerel HLS Gateway üzerinden doğrudan Smart TV'nize veya tarayıcınıza kesintisiz, çift sesli 1080p video akışı.
            </p>
            <button
              onClick={() => handleCardClick(heroItem)}
              tabIndex={10}
              className="flex items-center gap-2 px-5 py-2.5 bg-white text-black font-bold text-xs rounded-lg hover:bg-zinc-200 transition-colors shadow-md outline-none"
            >
              <Play size={14} fill="currentColor" />
              <span>Hemen İzle</span>
            </button>
          </div>

          {heroItem.poster && (
            <img
              src={heroItem.poster}
              alt={heroItem.title}
              className="w-36 md:w-48 aspect-[2/3] object-cover rounded-xl border border-white/10 shadow-2xl flex-shrink-0"
            />
          )}
        </div>
      )}

      {/* 3. Popüler & Trend İçerikler Izgarası */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-1.5">
            <Flame size={16} className="text-zinc-400" />
            <span>Popüler ve Trend İçerikler</span>
          </h2>
          <span className="text-xs text-zinc-500 font-mono">
            {featuredItems.length} başlık
          </span>
        </div>

        {loading ? (
          <div className="flex justify-center p-12">
            <div className="loader-spin" style={{ width: 28, height: 28, borderWidth: 3 }}></div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
            {featuredItems.map((item, index) => (
              <VideoCard
                key={`${item.url}-${index}`}
                item={item}
                onClick={handleCardClick}
                tabIndex={30 + index}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
