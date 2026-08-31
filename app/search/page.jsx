'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import SearchBar from '@/components/SearchBar';
import VideoCard from '@/components/VideoCard';
import { Search, Compass, Tv } from 'lucide-react';

function SearchPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialQuery = searchParams.get('q') || 'The Mentalist';

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (initialQuery) {
      handleSearch(initialQuery);
    }
  }, [initialQuery]);

  const handleSearch = async (searchQuery) => {
    if (!searchQuery || !searchQuery.trim()) return;
    setQuery(searchQuery);
    setIsSearching(true);

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery.trim())}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setResults(data);
      } else {
        setResults([]);
      }
    } catch (err) {
      console.error(err);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectCard = (item) => {
    router.push(`/watch?url=${encodeURIComponent(item.url)}`);
  };

  return (
    <div className="p-5 md:p-8 max-w-7xl mx-auto w-full">
      {/* Header */}
      <header className="flex justify-between items-center mb-6 pb-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold tracking-wider text-white lowercase">
            llofth
          </span>
          <span className="text-xs text-zinc-500 font-mono">• arama motoru</span>
        </div>
      </header>

      {/* Search Bar */}
      <SearchBar onSearch={handleSearch} isLoading={isSearching} />

      {/* Results Grid */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-1.5">
            <Search size={15} className="text-zinc-400" />
            <span>{query ? `"${query}" Sonuçları` : 'Arama Sonuçları'}</span>
          </h2>
          <span className="text-xs text-zinc-500 font-mono">
            {results.length} içerik bulundu
          </span>
        </div>

        {isSearching ? (
          <div className="flex justify-center p-12">
            <div className="loader-spin" style={{ width: 28, height: 28, borderWidth: 3 }}></div>
          </div>
        ) : results.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
            {results.map((item, index) => (
              <VideoCard
                key={`${item.url}-${index}`}
                item={item}
                onClick={handleSelectCard}
                tabIndex={20 + index}
              />
            ))}
          </div>
        ) : (
          <div className="bg-[#13141b] border border-white/5 rounded-xl p-10 text-center text-zinc-400">
            <Tv size={36} className="mx-auto mb-2 text-zinc-600" />
            <p className="text-sm text-zinc-300 font-medium">Sonuç bulunamadı.</p>
            <p className="text-xs text-zinc-500 mt-1">Farklı bir anahtar kelime ile arama yapmayı deneyin.</p>
          </div>
        )}
      </section>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="flex justify-center p-16">
        <div className="loader-spin" style={{ width: 28, height: 28, borderWidth: 3 }}></div>
      </div>
    }>
      <SearchPageContent />
    </Suspense>
  );
}
