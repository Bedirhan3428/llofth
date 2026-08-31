'use client';

import { Star, ChevronRight, Film } from 'lucide-react';

export default function SearchResults({ results, query, onSelectResult, isLoading }) {
  if (!results && !isLoading) return null;

  return (
    <div style={{ marginTop: '1.5rem', marginBottom: '2rem' }}>
      <div style={{
        background: 'rgba(18, 19, 26, 0.95)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        boxShadow: '0 15px 35px rgba(0, 0, 0, 0.5)'
      }}>
        <div style={{
          padding: '1rem 1.25rem',
          fontSize: '0.9rem',
          fontWeight: 600,
          color: 'var(--text-muted)',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          background: 'rgba(0, 0, 0, 0.2)'
        }}>
          <Film size={16} style={{ color: '#818cf8' }} />
          <span>"{query}" için arama sonuçları ({results?.length || 0})</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {results && results.length > 0 ? (
            results.map((item, index) => {
              const fallbackPoster = 'https://via.placeholder.com/50x70/1a1c28/ffffff?text=Resim';
              return (
                <button
                  key={`${item.url}-${index}`}
                  onClick={() => onSelectResult(item)}
                  tabIndex={10 + index}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1.25rem',
                    padding: '0.85rem 1.25rem',
                    textDecoration: 'none',
                    color: 'var(--text-main)',
                    borderBottom: index < results.length - 1 ? '1px solid rgba(255, 255, 255, 0.04)' : 'none',
                    background: 'transparent',
                    borderLeft: 'none',
                    borderRight: 'none',
                    borderTop: 'none',
                    width: '100%',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    position: 'relative'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(99, 102, 241, 0.15)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <img
                    src={item.poster || fallbackPoster}
                    alt={item.title}
                    onError={(e) => { e.currentTarget.src = fallbackPoster; }}
                    style={{
                      width: 50,
                      height: 70,
                      borderRadius: 'var(--radius-sm)',
                      objectFit: 'cover',
                      background: '#181924',
                      flexShrink: 0,
                      border: '1px solid rgba(255, 255, 255, 0.1)'
                    }}
                  />

                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.8rem' }}>
                      {item.year && (
                        <span style={{ color: 'var(--text-dim)', fontFamily: 'JetBrains Mono, monospace' }}>
                          {item.year}
                        </span>
                      )}
                      {item.imdb && (
                        <span style={{
                          color: '#fbbf24',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          fontWeight: 600,
                          fontFamily: 'JetBrains Mono, monospace'
                        }}>
                          <Star size={12} fill="#fbbf24" />
                          {item.imdb}
                        </span>
                      )}
                      <span style={{
                        background: 'rgba(99, 102, 241, 0.2)',
                        color: '#a5b4fc',
                        padding: '0.15rem 0.5rem',
                        borderRadius: 4,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        border: '1px solid rgba(99, 102, 241, 0.3)'
                      }}>
                        {item.type || (item.url.includes('/dizi/') ? 'Dizi' : 'Film')}
                      </span>
                    </div>

                    <h4 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#fff', margin: 0 }}>
                      {item.title}
                    </h4>
                  </div>

                  <div style={{ color: 'var(--text-dim)', display: 'flex', alignItems: 'center' }}>
                    <ChevronRight size={20} />
                  </div>
                </button>
              );
            })
          ) : (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              Sonuç bulunamadı. Lütfen başka bir anahtar kelime deneyin.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
