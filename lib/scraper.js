const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cheerio = require('cheerio');
const { execFile } = require('child_process');
const vm = require('vm');

const CACHE_DIR = path.join(process.cwd(), 'data', 'cache');

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

const memoryCache = new Map();
const streamCache = new Map();

function hashUrl(url) {
  const cleanUrl = url.trim().toLowerCase().replace(/\/sezon-\d+\/bolum-\d+.*$/, '/');
  return crypto.createHash('md5').update(cleanUrl).digest('hex');
}

/**
 * Cloudflare ve TLS korumasını aşan optimize edilmiş curl fonksiyonu
 */
function fetchHtmlWithCurl(targetUrl, referer = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    let origin = 'https://www.hdfilmcehennemi.nl';
    try {
      origin = new URL(targetUrl).origin;
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

    args.push(targetUrl);

    execFile('curl.exe', args, { maxBuffer: 20 * 1024 * 1024 }, (error, stdout) => {
      if (error) {
        return reject(new Error(`curl fetch failed: ${error.message}`));
      }
      if (!stdout || stdout.trim().length === 0) {
        return reject(new Error('Hedef sunucudan boş yanıt döndü.'));
      }
      resolve(stdout);
    });
  });
}

/**
 * HD ve Doğru Afiş Çıkarma Fonksiyonu
 */
function extractHdPoster($, cleanTitle, targetUrl) {
  let poster = '';
  const slug = targetUrl
    .replace(/https?:\/\/[^\/]+\//, '')
    .replace(/^dizi\//, '')
    .split('/')[0]
    .replace(/-\d+$/, '')
    .replace(/\/$/, '');

  // 1. Başlık ve slug ile birebir eşleşen resim
  $('img').each((_, el) => {
    if (poster) return;
    const src = $(el).attr('data-src') || $(el).attr('src') || '';
    const alt = ($(el).attr('alt') || '').toLowerCase();
    const titleLower = (cleanTitle || '').toLowerCase();

    if (src.includes('poster') || src.includes('cover')) {
      if (!src.includes('/cast/') && !src.includes('/users/')) {
        if ((titleLower && alt.includes(titleLower)) || (slug && src.includes(slug))) {
          poster = src;
        }
      }
    }
  });

  // 2. Bulunamazsa slug üzerinden HD afiş oluştur
  if (!poster && slug) {
    poster = `https://www.hdfilmcehennemi.nl/images/poster/${slug}.webp`;
  }

  // 3. Kalite yükseltme (Thumbnail -> Full HD Poster)
  if (poster) {
    poster = poster
      .replace('/images/thumb/poster/', '/images/poster/')
      .replace('/images/list/poster/', '/images/poster/')
      .replace('@2x', '');
  }

  return poster;
}

/**
 * Site İçi Canlı Arama
 */
async function searchContent(query) {
  if (!query || !query.trim()) return [];

  const searchUrl = `https://www.hdfilmcehennemi.nl/search?q=${encodeURIComponent(query.trim())}`;
  const stdout = await fetchHtmlWithCurl(searchUrl, 'https://www.hdfilmcehennemi.nl/', {
    'X-Requested-With': 'fetch',
    'Accept': 'application/json, text/javascript, */*; q=0.01'
  });

  let rawResults = [];
  try {
    const json = JSON.parse(stdout);
    if (Array.isArray(json.results)) {
      rawResults = json.results;
    }
  } catch (e) {
    const $ = cheerio.load(stdout);
    $('a.search-result, .search-results a').each((i, el) => {
      rawResults.push($.html(el));
    });
  }

  const results = [];

  for (const itemHtml of rawResults) {
    const $ = cheerio.load(itemHtml);
    const aTag = $('a.search-result, a').first();
    if (!aTag.length) continue;

    const href = aTag.attr('href') || '';
    const fullUrl = href.startsWith('http') ? href : `https://www.hdfilmcehennemi.nl${href}`;

    const title = aTag.find('.title, .search-result-title, h4').first().text().trim() || aTag.text().trim();
    const rawPoster = aTag.find('img').attr('data-src') || aTag.find('img').attr('src') || '';
    
    // HD Afiş Yükseltme
    let poster = rawPoster;
    if (poster) {
      poster = poster
        .replace('/images/thumb/poster/', '/images/poster/')
        .replace('/images/list/poster/', '/images/poster/')
        .replace('@2x', '');
    }

    const year = aTag.find('.year, .search-result-year, time').first().text().trim();
    const imdb = aTag.find('.imdb, .search-result-imdb, .rating, span.badge').first().text().trim();
    const type = href.includes('/dizi/') ? 'Dizi' : 'Film';

    results.push({
      title,
      url: fullUrl,
      poster,
      year,
      imdb,
      type,
      rawHtml: itemHtml
    });
  }

  return results;
}

/**
 * Dizi, Sezon ve Bölüm Ağacını Çıkarma
 */
async function scrapeSeries(targetUrl, useCache = true) {
  const cacheKey = hashUrl(targetUrl);
  const cacheFilePath = path.join(CACHE_DIR, `${cacheKey}.json`);

  if (useCache && memoryCache.has(cacheKey)) {
    return { ...memoryCache.get(cacheKey), cached: true, cacheSource: 'memory' };
  }

  if (useCache && fs.existsSync(cacheFilePath)) {
    try {
      const fileData = fs.readFileSync(cacheFilePath, 'utf8');
      const parsed = JSON.parse(fileData);
      if (parsed && parsed.poster && !parsed.poster.includes('/thumb/') && !parsed.poster.includes('ncis') && !parsed.poster.includes('narcos')) {
        memoryCache.set(cacheKey, parsed);
        return { ...parsed, cached: true, cacheSource: 'file' };
      }
    } catch (err) {}
  }

  const html = await fetchHtmlWithCurl(targetUrl);
  const $ = cheerio.load(html);

  const rawH1 = $('h1.card-title, h1').first().text().trim();
  const cleanTitle = rawH1.replace(/\s*\d+\.\s*Sezon.*$/i, '').trim() || $('meta[property="og:title"]').attr('content') || 'Bilinmeyen Dizi';

  const poster = extractHdPoster($, cleanTitle, targetUrl);
  const description = $('div.card-text, p.card-text, .overview, .synopsis, meta[name="description"]').first().text().trim() ||
                      $('meta[property="og:description"]').attr('content') || '';

  const seasons = [];
  let totalEpisodes = 0;

  const seasonTabContents = $('.seasons-tab-content');

  if (seasonTabContents.length > 0) {
    seasonTabContents.each((index, el) => {
      const tabAttr = $(el).attr('data-tab');
      const idAttr = $(el).attr('id');
      let seasonNum = parseInt(tabAttr || (idAttr ? idAttr.replace('seasons-', '') : (index + 1)), 10);
      if (isNaN(seasonNum)) seasonNum = index + 1;

      const episodes = [];

      $(el).find('a.mini-poster, .seasons-tab-item, .episode-item').each((j, epEl) => {
        const epHref = $(epEl).attr('href') || $(epEl).find('a').attr('href') || '';
        const epTitle = $(epEl).find('h4.mini-poster-title, a.card-title').text().trim() || $(epEl).text().trim();
        const epDate = $(epEl).find('time.episode-date, span.card-date, span.date').text().trim();
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

        const absoluteEpHref = epHref.startsWith('http') ? epHref : (epHref ? new URL(epHref, targetUrl).href : '');

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
  }

  // Fallback: JSON-LD
  if (seasons.length === 0) {
    $('script[type="application/ld+json"]').each((_, script) => {
      try {
        const text = $(script).html();
        const json = JSON.parse(text);
        if (json.containsSeason && Array.isArray(json.containsSeason)) {
          json.containsSeason.forEach((s) => {
            const seasonNum = parseInt(s.seasonNumber, 10) || 1;
            const epList = [];
            if (Array.isArray(s.episode)) {
              s.episode.forEach((ep, idx) => {
                epList.push({
                  episodeNumber: parseInt(ep.episodeNumber, 10) || (idx + 1),
                  title: ep.name || `${seasonNum}. Sezon ${idx + 1}. Bölüm`,
                  url: ep.url || '',
                  date: ep.datePublished ? ep.datePublished.split('T')[0] : ''
                });
              });
            }
            if (epList.length > 0) {
              totalEpisodes += epList.length;
              seasons.push({
                seasonNumber: seasonNum,
                seasonTitle: `${seasonNum}. Sezon`,
                episodeCount: epList.length,
                episodes: epList
              });
            }
          });
        }
      } catch (e) {}
    });
  }

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

  try {
    fs.writeFileSync(cacheFilePath, JSON.stringify(seriesData, null, 2), 'utf8');
    memoryCache.set(cacheKey, seriesData);
  } catch (err) {}

  return { ...seriesData, cached: false };
}

/**
 * Ham M3U8 Resolver
 */
async function resolveStreamUrl(pageUrl) {
  if (!pageUrl || typeof pageUrl !== 'string') {
    throw new Error('Geçerli bir pageUrl gereklidir.');
  }

  const cleanUrl = pageUrl.trim();
  const cacheKey = crypto.createHash('md5').update(cleanUrl).digest('hex');

  if (streamCache.has(cacheKey)) {
    const cached = streamCache.get(cacheKey);
    if (Date.now() - cached.timestamp < 2 * 60 * 60 * 1000) {
      return {
        success: true,
        pageUrl: cleanUrl,
        rawM3u8: cached.rawM3u8,
        streamUrl: `/api/proxy/playlist?url=${encodeURIComponent(cached.rawM3u8)}`,
        cached: true
      };
    }
  }

  const pageHtml = await fetchHtmlWithCurl(cleanUrl);
  const $page = cheerio.load(pageHtml);

  const directMatch = pageHtml.match(/https?:\/\/[^\s"'<>]+\.(m3u8|txt)[^\s"'<>]*/);
  if (directMatch && (directMatch[0].includes('/hls/') || directMatch[0].includes('master'))) {
    const rawM3u8 = directMatch[0];
    streamCache.set(cacheKey, { rawM3u8, timestamp: Date.now() });
    return {
      success: true,
      pageUrl: cleanUrl,
      rawM3u8: rawM3u8,
      streamUrl: `/api/proxy/playlist?url=${encodeURIComponent(rawM3u8)}`,
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
  const iframeHtml = await fetchHtmlWithCurl(absoluteIframeUrl, cleanUrl);
  const $iframe = cheerio.load(iframeHtml);

  let rawM3u8 = null;

  $iframe('script').each((i, el) => {
    const text = $iframe(el).html() || '';
    if (text.includes('function dc_') || text.includes('var s_') || text.includes('jwplayer')) {
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
        vm.runInContext(text, context, { timeout: 1000 });
        for (const key of Object.keys(sandbox)) {
          const val = sandbox[key];
          if (typeof val === 'string' && (val.includes('.m3u8') || val.includes('.txt') || val.includes('/hls/'))) {
            rawM3u8 = val;
            return false;
          }
        }
      } catch (err) {}
    }
  });

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
    throw new Error('M3U8 akış adresi sökülemedi.');
  }

  streamCache.set(cacheKey, { rawM3u8, timestamp: Date.now() });

  return {
    success: true,
    pageUrl: cleanUrl,
    rawM3u8: rawM3u8,
    streamUrl: `/api/proxy/playlist?url=${encodeURIComponent(rawM3u8)}`,
    cached: false
  };
}

function clearCache() {
  memoryCache.clear();
  streamCache.clear();
  if (fs.existsSync(CACHE_DIR)) {
    const files = fs.readdirSync(CACHE_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        fs.unlinkSync(path.join(CACHE_DIR, file));
      }
    }
  }
}

module.exports = {
  searchContent,
  scrapeSeries,
  resolveStreamUrl,
  clearCache
};
