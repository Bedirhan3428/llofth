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
 * Get saved progress for a specific episode or series
 */
export function getEpisodeProgress(seriesUrl, episodeUrl) {
  const history = getWatchHistory();
  if (episodeUrl) {
    const found = history.find(h => h.episodeUrl === episodeUrl);
    if (found) return found;
  }
  if (seriesUrl) {
    const found = history.find(h => h.seriesUrl === seriesUrl);
    if (found) return found;
  }
  return null;
}

/**
 * Save or update playback progress
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

    // Exclude if finished (> 95%) or barely started (< 5s)
    const isFinished = progressPercent > 95;

    const item = {
      seriesUrl,
      seriesTitle: seriesTitle || 'Dizi',
      episodeUrl,
      episodeTitle: episodeTitle || 'Bölüm',
      seasonNumber: seasonNumber || 1,
      episodeNumber: episodeNumber || 1,
      seasonIdx: seasonIdx || 0,
      epIdx: epIdx || 0,
      poster: poster || '',
      currentTime: Math.floor(currentTime),
      duration: Math.floor(duration),
      progressPercent: Math.round(progressPercent),
      isFinished,
      updatedAt: Date.now()
    };

    // Remove existing entry for this episode/series to push to top
    const filtered = history.filter(h => h.seriesUrl !== seriesUrl);

    if (!isFinished) {
      filtered.unshift(item);
    }

    // Keep top 20 items
    const truncated = filtered.slice(0, 20);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(truncated));
  } catch (e) {
    console.error('saveWatchProgress error:', e);
  }
}

/**
 * Remove an item from watch history
 */
export function removeFromWatchHistory(seriesUrl) {
  if (typeof window === 'undefined') return;
  try {
    const history = getWatchHistory();
    const filtered = history.filter(h => h.seriesUrl !== seriesUrl);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered));
  } catch (e) {}
}
