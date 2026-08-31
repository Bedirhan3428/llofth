const { execFile } = require('child_process');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

// Önbellek Dizini
const CACHE_DIR = path.join(__dirname, 'data', 'cache');

// Bellek İçi Önbellek (RAM Cache)
const memoryCache = new Map();
const streamCache = new Map();
const searchCache = new Map();

// Önbellek Süreleri (TTL)
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const STREAM_CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const SEARCH_CACHE_TTL_MS = 1 * 60 * 60 * 1000; // Arama sonuçları için 1 saat

// Zorunlu HTTP Başlıkları
const DEFAULT_HEADERS = {
  'Referer': 'https://www.hdfilmcehennemi.nl/',
  'Origin': 'https://www.hdfilmcehennemi.nl',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
};

async function ensureCacheDir() {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch (err) {}
}

function getCacheKey(url) {
  const cleanUrl = url.trim().toLowerCase().replace(/\/sezon-\d+\/bolum-\d+.*$/, '/');
  return crypto.createHash('md5').update(cleanUrl).digest('hex');
}

/**
 * Cloudflare ve TLS korumasını aşmak için optimize edilmiş HTTP isteği yapar.
 */
function fetchHtml(url, referer = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    let origin = 'https://www.hdfilmcehennemi.nl';
    try {
      origin = new URL(url).origin;
    } catch (e) {}

    const args = [
      '-s', '-L',
      '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      '-H', `Referer: ${referer || origin + '/'}`,
      '-H', `Origin: ${origin}`,
      '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      '-H', 'Accept-Language: tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
      '--compressed'
    ];

    for (const [key, value] of Object.entries(extraHeaders)) {
      args.push('-H', `${key}: ${value}`);
    }

    args.push(url);

    execFile('curl.exe', args, { maxBuffer: 15 * 1024 * 1024 }, async (error, stdout) => {
      if (!error && stdout && stdout.length > 5) {
        return resolve(stdout);
      }

      try {
        const res = await axios.get(url, {
          headers: {
            ...DEFAULT_HEADERS,
            'Referer': referer || `${origin}/`,
            'Origin': origin,
            ...extraHeaders
          },
          timeout: 12000
        });
        resolve(typeof res.data === 'string' ? res.data : JSON.stringify(res.data));
      } catch (axiosErr) {
        reject(new Error(`İstek başarısız: ${axiosErr.message}`));
      }
    });
  });
}

/**
 * Site içi arama yapar ve yapılandırılmış dizi döner.
 */
async function searchContent(query) {
  if (!query || typeof query !== 'string' || !query.trim()) {
    return [];
  }

  const cleanQuery = query.trim();
  const cacheKey = cleanQuery.toLowerCase();

  if (searchCache.has(cacheKey)) {
    const cached = searchCache.get(cacheKey);
    if (Date.now() - cached.timestamp < SEARCH_CACHE_TTL_MS) {
      return cached.data;
    }
  }

  const searchUrl = `https://www.hdfilmcehennemi.nl/search?q=${encodeURIComponent(cleanQuery)}`;
  const rawOutput = await fetchHtml(searchUrl, 'https://www.hdfilmcehennemi.nl/', {
    'X-Requested-With': 'fetch',
    'Accept': 'application/json, text/plain, */*'
  });

  let resultsHtmlArray = [];
  try {
    const parsedJson = JSON.parse(rawOutput);
    if (parsedJson && Array.isArray(parsedJson.results)) {
      resultsHtmlArray = parsedJson.results;
    }
  } catch (e) {
    // JSON parse edilemediyse HTML formatında ayrıştırmayı dene
    const $ = cheerio.load(rawOutput);
    $('a.search-result, .search-results a').each((i, el) => {
      resultsHtmlArray.push($.html(el));
    });
  }

  const items = [];

  for (const htmlSnippet of resultsHtmlArray) {
    const $ = cheerio.load(htmlSnippet);
    const $a = $('a').first();
    let url = $a.attr('href') || $('a.search-result').attr('href') || '';
    if (!url) continue;

    if (!url.startsWith('http')) {
      url = new URL(url, 'https://www.hdfilmcehennemi.nl').href;
    }

    let title = $('.search-result-title, h4.title, h4, .title').first().text().trim();
    let poster = $('img').attr('data-src') || $('img').attr('src') || '';
    if (poster && !poster.startsWith('http')) {
      poster = new URL(poster, 'https://www.hdfilmcehennemi.nl').href;
    }

    const year = $('.year, .search-result-year, time').first().text().trim();
    const imdb = $('.imdb, .search-result-imdb, .rating').first().text().trim();
    let type = $('.type, .search-result-type, .badge').first().text().trim();
    if (!type) {
      type = url.includes('/dizi/') ? 'Dizi' : 'Film';
    }

    if (title) {
      items.push({
        title: title,
        url: url,
        poster: poster,
        year: year,
        imdb: imdb,
        type: type,
        rawHtml: htmlSnippet // Orijinal HTML yapısını frontend için de hazır bulundur
      });
    }
  }

  searchCache.set(cacheKey, { data: items, timestamp: Date.now() });
  return items;
}

/**
 * P.A.C.K.E.R. ve Obfuscated JS kodlarını VM içinde güvenle çözümler.
 */
function extractStreamFromScript(scriptContent) {
  const sandbox = {
    atob: (str) => Buffer.from(str, 'base64').toString('binary'),
    btoa: (str) => Buffer.from(str, 'binary').toString('base64'),
    Math: Math,
    String: String,
    window: {},
    document: { readyState: 'complete' }
  };

  const context = vm.createContext(sandbox);
  try {
    vm.runInContext(scriptContent, context, { timeout: 1000 });
    for (const key of Object.keys(sandbox)) {
      const val = sandbox[key];
      if (typeof val === 'string' && (val.includes('.m3u8') || val.includes('.txt') || val.includes('/hls/'))) {
        return val;
      }
    }
  } catch (err) {}
  return null;
}

/**
 * Bölüm sayfasından veya gömülü Player iframe'inden ham M3U8/TXT stream linkini söker.
 */
async function resolveStreamUrl(pageUrl) {
  if (!pageUrl || typeof pageUrl !== 'string') {
    throw new Error('Geçerli bir pageUrl parametresi gereklidir.');
  }

  const cleanUrl = pageUrl.trim();
  const cacheKey = crypto.createHash('md5').update(cleanUrl).digest('hex');

  if (streamCache.has(cacheKey)) {
    const cached = streamCache.get(cacheKey);
    if (Date.now() - cached.timestamp < STREAM_CACHE_TTL_MS) {
      return {
        success: true,
        pageUrl: cleanUrl,
        rawM3u8: cached.rawM3u8,
        streamUrl: `/playlist?url=${encodeURIComponent(cached.rawM3u8)}`,
        cached: true
      };
    }
  }

  const pageHtml = await fetchHtml(cleanUrl);
  const $page = cheerio.load(pageHtml);

  const directMatch = pageHtml.match(/https?:\/\/[^\s"'<>]+\.(m3u8|txt)[^\s"'<>]*/);
  if (directMatch && (directMatch[0].includes('/hls/') || directMatch[0].includes('master'))) {
    const rawM3u8 = directMatch[0];
    streamCache.set(cacheKey, { rawM3u8, timestamp: Date.now() });
    return {
      success: true,
      pageUrl: cleanUrl,
      rawM3u8: rawM3u8,
      streamUrl: `/playlist?url=${encodeURIComponent(rawM3u8)}`,
      cached: false
    };
  }

  let iframeSrc = $page('iframe').attr('data-src') || $page('iframe').attr('src');
  if (!iframeSrc) {
    $page('[data-frame], [data-src], [data-embed]').each((i, el) => {
      const src = $page(el).attr('data-frame') || $page(el).attr('data-src') || $page(el).attr('data-embed');
      if (src && (src.includes('embed') || src.includes('video') || src.includes('player'))) {
        iframeSrc = src;
        return false;
      }
    });
  }

  if (!iframeSrc) {
    throw new Error('Bölüm sayfasında oynatıcı iframe kaynağı bulunamadı.');
  }

  const absoluteIframeUrl = new URL(iframeSrc, cleanUrl).href;
  const iframeHtml = await fetchHtml(absoluteIframeUrl, cleanUrl);
  const $iframe = cheerio.load(iframeHtml);

  let rawM3u8 = null;

  $iframe('script').each((i, el) => {
    const text = $iframe(el).html() || '';
    if (text.includes('function dc_') || text.includes('var s_') || text.includes('jwplayer')) {
      const decoded = extractStreamFromScript(text);
      if (decoded && (decoded.includes('/hls/') || decoded.includes('.m3u8') || decoded.includes('.txt'))) {
        rawM3u8 = decoded;
        return false;
      }
    }
  });

  if (!rawM3u8) {
    $iframe('script[type="application/ld+json"]').each((i, el) => {
      try {
        const json = JSON.parse($iframe(el).html());
        if (json.contentUrl && (json.contentUrl.includes('.m3u8') || json.contentUrl.includes('.txt') || json.contentUrl.includes('/hls/'))) {
          rawM3u8 = json.contentUrl;
          return false;
        }
      } catch (e) {}
    });
  }

  if (!rawM3u8) {
    const iframeMatches = iframeHtml.match(/https?:\/\/[^\s"'<>]+\.(m3u8|txt)[^\s"'<>]*/g);
    if (iframeMatches) {
      for (const m of iframeMatches) {
        if (m.includes('/hls/') || m.includes('master') || m.includes('cdnimages')) {
          rawM3u8 = m;
          break;
        }
      }
    }
  }

  if (!rawM3u8) {
    throw new Error('Oynatıcı kaynak kodlarından geçerli M3U8/HLS akış adresi sökülemedi.');
  }

  streamCache.set(cacheKey, { rawM3u8, timestamp: Date.now() });

  return {
    success: true,
    pageUrl: cleanUrl,
    rawM3u8: rawM3u8,
    streamUrl: `/playlist?url=${encodeURIComponent(rawM3u8)}`,
    cached: false
  };
}

/**
 * Verilen dizi veya bölüm sayfasından tüm sezon ve bölümleri parse eder.
 */
async function scrapeSeries(targetUrl, forceRefresh = false) {
  if (!targetUrl || typeof targetUrl !== 'string') {
    throw new Error('Geçerli bir URL sağlanmalıdır.');
  }

  await ensureCacheDir();
  const cacheKey = getCacheKey(targetUrl);
  const cacheFilePath = path.join(CACHE_DIR, `${cacheKey}.json`);

  if (!forceRefresh && memoryCache.has(cacheKey)) {
    const cached = memoryCache.get(cacheKey);
    if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return { ...cached.data, cached: true, cacheSource: 'memory' };
    }
  }

  if (!forceRefresh) {
    try {
      const fileData = await fs.readFile(cacheFilePath, 'utf-8');
      const parsed = JSON.parse(fileData);
      if (Date.now() - new Date(parsed.scrapedAt).getTime() < CACHE_TTL_MS) {
        memoryCache.set(cacheKey, { data: parsed, timestamp: Date.now() });
        return { ...parsed, cached: true, cacheSource: 'file' };
      }
    } catch (e) {}
  }

  const html = await fetchHtml(targetUrl);
  const $ = cheerio.load(html);

  const rawH1 = $('h1.card-title, h1').first().text().trim();
  const cleanTitle = rawH1.replace(/\s*\d+\.\s*Sezon.*$/i, '').trim() || $('meta[property="og:title"]').attr('content') || 'Bilinmeyen Dizi';

  let poster = $('img.card-img, .poster img, .cover-img, img[alt*="' + cleanTitle + '"]').first().attr('data-src') || 
               $('img.card-img, .poster img, .cover-img, img[alt*="' + cleanTitle + '"]').first().attr('src') || '';
  if (poster && !poster.startsWith('http')) {
    poster = new URL(poster, targetUrl).href;
  }

  const description = $('p.card-text, .overview, .synopsis, meta[name="description"]').first().text().trim() || 
                      $('meta[property="og:description"]').attr('content') || '';

  const seasons = [];
  let totalEpisodes = 0;

  const seasonTabContents = $('.seasons-tab-content');

  seasonTabContents.each((index, el) => {
    const tabAttr = $(el).attr('data-tab');
    const idAttr = $(el).attr('id');
    let seasonNum = parseInt(tabAttr || (idAttr ? idAttr.replace('seasons-', '') : (index + 1)), 10);
    if (isNaN(seasonNum)) seasonNum = index + 1;

    const episodes = [];

    $(el).find('a.mini-poster').each((j, epEl) => {
      const epHref = $(epEl).attr('href');
      const epTitle = $(epEl).find('h4.mini-poster-title').text().trim();
      const epDate = $(epEl).find('time.episode-date').text().trim();
      let epImg = $(epEl).find('img').attr('data-src') || $(epEl).find('img').attr('src') || '';
      if (epImg && !epImg.startsWith('http')) {
        epImg = new URL(epImg, targetUrl).href;
      }

      let epNum = null;
      const titleMatch = epTitle.match(/(\d+)\.\s*Bölüm/i);
      if (titleMatch) {
        epNum = parseInt(titleMatch[1], 10);
      } else {
        const urlMatch = epHref ? epHref.match(/bolum-(\d+)/i) : null;
        if (urlMatch) epNum = parseInt(urlMatch[1], 10);
        else epNum = j + 1;
      }

      const absoluteEpHref = epHref ? new URL(epHref, targetUrl).href : '';

      episodes.push({
        episodeNumber: epNum,
        title: epTitle || `${seasonNum}. Sezon ${epNum}. Bölüm`,
        url: absoluteEpHref,
        date: epDate,
        image: epImg
      });
    });

    episodes.sort((a, b) => (a.episodeNumber || 0) - (b.episodeNumber || 0));
    totalEpisodes += episodes.length;

    seasons.push({
      seasonNumber: seasonNum,
      seasonTitle: `${seasonNum}. Sezon`,
      episodeCount: episodes.length,
      episodes: episodes
    });
  });

  seasons.sort((a, b) => a.seasonNumber - b.seasonNumber);

  const seriesData = {
    success: true,
    title: cleanTitle,
    poster: poster,
    description: description,
    sourceUrl: targetUrl,
    totalSeasons: seasons.length,
    totalEpisodes: totalEpisodes,
    seasons: seasons,
    scrapedAt: new Date().toISOString()
  };

  memoryCache.set(cacheKey, { data: seriesData, timestamp: Date.now() });
  try {
    await fs.writeFile(cacheFilePath, JSON.stringify(seriesData, null, 2), 'utf-8');
  } catch (err) {}

  return { ...seriesData, cached: false };
}

async function clearCache(targetUrl = null) {
  if (targetUrl) {
    const key = getCacheKey(targetUrl);
    memoryCache.delete(key);
    try {
      await fs.unlink(path.join(CACHE_DIR, `${key}.json`));
    } catch (e) {}
    return { success: true, message: 'Belirtilen dizi önbellekten silindi.' };
  } else {
    memoryCache.clear();
    streamCache.clear();
    searchCache.clear();
    try {
      const files = await fs.readdir(CACHE_DIR);
      for (const f of files) {
        if (f.endsWith('.json')) {
          await fs.unlink(path.join(CACHE_DIR, f));
        }
      }
    } catch (e) {}
    return { success: true, message: 'Tüm önbellek temizlendi.' };
  }
}

async function listCachedSeries() {
  await ensureCacheDir();
  const list = [];
  try {
    const files = await fs.readdir(CACHE_DIR);
    for (const f of files) {
      if (f.endsWith('.json')) {
        try {
          const content = await fs.readFile(path.join(CACHE_DIR, f), 'utf-8');
          const data = JSON.parse(content);
          list.push({
            title: data.title,
            poster: data.poster,
            sourceUrl: data.sourceUrl,
            totalSeasons: data.totalSeasons,
            totalEpisodes: data.totalEpisodes,
            scrapedAt: data.scrapedAt
          });
        } catch (e) {}
      }
    }
  } catch (e) {}
  return list;
}

module.exports = {
  searchContent,
  scrapeSeries,
  resolveStreamUrl,
  clearCache,
  listCachedSeries
};
