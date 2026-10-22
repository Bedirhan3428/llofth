'use client';

const HISTORY_KEY = 'llofth_watch_history';

/**
 * Get all watch history items sorted by last updated
 */
export function getWatchHistory() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    console.error('getWatchHistory error:', e);
    return [];
  }
}

/**
 * Get the full history entry for a series (including last watched episode and all episode progresses)
 */
export function getSeriesProgress(seriesUrl) {
  if (!seriesUrl) return null;
  const history = getWatchHistory();
  return history.find(h => h.seriesUrl === seriesUrl) || null;
}

/**
 * Get all saved episode progresses for a series as a dictionary: { [episodeUrl]: progressObject }
 */
export function getAllSeriesEpisodeProgress(seriesUrl) {
  if (!seriesUrl) return {};
  const series = getSeriesProgress(seriesUrl);
  if (!series) return {};
  
  const episodesMap = { ...(series.episodes || {}) };
  // Backward compatibility: if series has legacy single episode fields
  if (series.episodeUrl && !episodesMap[series.episodeUrl]) {
    episodesMap[series.episodeUrl] = {
      episodeUrl: series.episodeUrl,
      episodeTitle: series.episodeTitle || 'Bölüm',
      seasonNumber: series.seasonNumber || 1,
      episodeNumber: series.episodeNumber || 1,
      seasonIdx: series.seasonIdx ?? 0,
      epIdx: series.epIdx ?? 0,
      currentTime: series.currentTime || 0,
      duration: series.duration || 0,
      progressPercent: series.progressPercent || 0,
      isFinished: !!series.isFinished,
      updatedAt: series.updatedAt || Date.now()
    };
  }
  return episodesMap;
}

/**
 * Get saved progress for a SPECIFIC episode.
 * Note: If episodeUrl is provided, it ONLY returns progress for that exact episode.
 * If episodeUrl is NOT provided, it returns the last watched episode of the series.
 */
export function getEpisodeProgress(seriesUrl, episodeUrl) {
  const history = getWatchHistory();

  // 1. If episodeUrl is specified, search for this exact episode
  if (episodeUrl) {
    if (seriesUrl) {
      const series = history.find(h => h.seriesUrl === seriesUrl);
      if (series) {
        if (series.episodes && series.episodes[episodeUrl]) {
          return series.episodes[episodeUrl];
        }
        if (series.lastEpisodeUrl === episodeUrl || series.episodeUrl === episodeUrl) {
          return {
            episodeUrl,
            episodeTitle: series.episodeTitle,
            seasonNumber: series.seasonNumber,
            episodeNumber: series.episodeNumber,
            seasonIdx: series.seasonIdx,
            epIdx: series.epIdx,
            currentTime: series.currentTime,
            duration: series.duration,
            progressPercent: series.progressPercent,
            isFinished: series.isFinished,
            updatedAt: series.updatedAt
          };
        }
      }
    }

    // Search across all series in case seriesUrl wasn't provided or mismatch
    for (const item of history) {
      if (item.episodes && item.episodes[episodeUrl]) {
        return item.episodes[episodeUrl];
      }
      if (item.lastEpisodeUrl === episodeUrl || item.episodeUrl === episodeUrl) {
        return item;
      }
    }

    return null; // Do NOT fall back to another episode!
  }

  // 2. If episodeUrl is NOT provided, return the series' last watched episode
  if (seriesUrl) {
    const found = history.find(h => h.seriesUrl === seriesUrl);
    if (found) return found;
  }

  return null;
}

/**
 * Save or update playback progress for a specific episode of a series
 */
export function saveWatchProgress({
  seriesUrl,
  seriesTitle,
  episodeUrl,
  episodeTitle,
  seasonNumber,
  episodeNumber,
  seasonIdx,
  epIdx,
  poster,
  currentTime,
  duration
}) {
  if (typeof window === 'undefined' || !seriesUrl || !episodeUrl) return;
  if (!duration || duration <= 0) return;

  try {
    const history = getWatchHistory();
    const progressPercent = Math.min(100, Math.max(0, (currentTime / duration) * 100));

    // Exclude or mark finished if > 92%
    const isFinished = progressPercent > 92;

    const existingSeries = history.find(h => h.seriesUrl === seriesUrl);
    const existingEpisodes = existingSeries?.episodes ? { ...existingSeries.episodes } : {};

    // If legacy format had episodeUrl, migrate it into episodes map
    if (existingSeries?.episodeUrl && !existingEpisodes[existingSeries.episodeUrl]) {
      existingEpisodes[existingSeries.episodeUrl] = {
        episodeUrl: existingSeries.episodeUrl,
        episodeTitle: existingSeries.episodeTitle || 'Bölüm',
        seasonNumber: existingSeries.seasonNumber || 1,
        episodeNumber: existingSeries.episodeNumber || 1,
        seasonIdx: existingSeries.seasonIdx ?? 0,
        epIdx: existingSeries.epIdx ?? 0,
        currentTime: existingSeries.currentTime || 0,
        duration: existingSeries.duration || 0,
        progressPercent: existingSeries.progressPercent || 0,
        isFinished: !!existingSeries.isFinished,
        updatedAt: existingSeries.updatedAt || Date.now()
      };
    }

    // Update current episode progress
    existingEpisodes[episodeUrl] = {
      episodeUrl,
      episodeTitle: episodeTitle || 'Bölüm',
      seasonNumber: seasonNumber || 1,
      episodeNumber: episodeNumber || 1,
      seasonIdx: seasonIdx ?? 0,
      epIdx: epIdx ?? 0,
      currentTime: Math.floor(currentTime),
      duration: Math.floor(duration),
      progressPercent: Math.round(progressPercent),
      isFinished,
      updatedAt: Date.now()
    };

    const seriesItem = {
      seriesUrl,
      seriesTitle: seriesTitle || existingSeries?.seriesTitle || 'Dizi',
      poster: poster || existingSeries?.poster || '',
      lastEpisodeUrl: episodeUrl,
      episodeUrl, // for backward compatibility with ContinueWatching
      lastEpisodeTitle: episodeTitle || 'Bölüm',
      episodeTitle: episodeTitle || 'Bölüm', // for backward compatibility
      seasonNumber: seasonNumber || 1,
      episodeNumber: episodeNumber || 1,
      seasonIdx: seasonIdx ?? 0,
      epIdx: epIdx ?? 0,
      currentTime: Math.floor(currentTime),
      duration: Math.floor(duration),
      progressPercent: Math.round(progressPercent),
      isFinished,
      updatedAt: Date.now(),
      episodes: existingEpisodes
    };

    // Remove existing entry for this series to push updated item to top
    const filtered = history.filter(h => h.seriesUrl !== seriesUrl);
    filtered.unshift(seriesItem);

    // Keep top 30 series in history
    const truncated = filtered.slice(0, 30);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(truncated));
  } catch (e) {
    console.error('saveWatchProgress error:', e);
  }
}

/**
 * Remove an entire series from watch history
 */
export function removeFromWatchHistory(seriesUrl) {
  if (typeof window === 'undefined') return;
  try {
    const history = getWatchHistory();
    const filtered = history.filter(h => h.seriesUrl !== seriesUrl);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered));
  } catch (e) {
    console.error('removeFromWatchHistory error:', e);
  }
}
