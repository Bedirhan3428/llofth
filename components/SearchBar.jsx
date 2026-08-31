'use client';

import { useState } from 'react';
import { Search, X } from 'lucide-react';

const TRENDING_CHIPS = [
  'The Mentalist',
  'Breaking Bad',
  'Dune',
  'Avatar',
  'Game of Thrones',
  'Prodigal Son'
];

export default function SearchBar({ onSearch, isLoading }) {
  const [query, setQuery] = useState('');

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
    }
  };

  const handleChipClick = (chip) => {
    setQuery(chip);
    onSearch(chip);
  };

  return (
    <div className="w-full mb-7">
      {/* Search Input Bar */}
      <form onSubmit={handleSubmit} className="relative flex items-center w-full max-w-3xl mx-auto mb-4">
        <div className="relative flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Dizi veya film arayın..."
            tabIndex={10}
            autoComplete="off"
            spellCheck="false"
            className="w-full h-11 bg-[#13141b] border border-white/10 rounded-lg pl-10 pr-10 text-zinc-100 placeholder-zinc-500 text-sm focus:border-white/30 focus:bg-[#171821] outline-none transition-colors"
          />
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none">
            <Search size={16} />
          </div>

          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              tabIndex={11}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white p-1"
            >
              <X size={15} />
            </button>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading}
          tabIndex={12}
          className="ml-2.5 h-11 px-5 bg-white/10 hover:bg-white/15 text-white text-xs font-semibold rounded-lg border border-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed outline-none"
        >
          {isLoading ? (
            <span className="flex items-center gap-1.5">
              <span className="loader-spin"></span>
              <span>Aranıyor</span>
            </span>
          ) : (
            <span>Ara</span>
          )}
        </button>
      </form>

      {/* Chips */}
      <div className="flex items-center justify-center gap-1.5 flex-wrap max-w-3xl mx-auto">
        {TRENDING_CHIPS.map((chip, idx) => (
          <button
            key={chip}
            type="button"
            onClick={() => handleChipClick(chip)}
            tabIndex={13 + idx}
            className="px-3 py-1 rounded-md bg-white/5 hover:bg-white/10 border border-white/5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors outline-none"
          >
            {chip}
          </button>
        ))}
      </div>
    </div>
  );
}
