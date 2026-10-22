const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// CloudFront IPs for TMDb to bypass Turkish ISP port 53 DNS poisoning
const TMDB_CLOUDFRONT_IPS = [
  '99.84.152.32',
  '99.84.152.53',
  '99.84.152.85',
  '99.84.152.8'
];

const TMDB_IMAGE_IPS = [
  '185.111.111.159',
  '185.111.111.160'
];

let ipIndex = 0;
function getTmdbIp() {
  const ip = TMDB_CLOUDFRONT_IPS[ipIndex % TMDB_CLOUDFRONT_IPS.length];
  ipIndex++;
  return ip;
}

const tmdbAgent = new https.Agent({
  lookup: (hostname, options, callback) => {
    let cb = callback;
    let opts = options;
    if (typeof options === 'function') {
      cb = options;
      opts = {};
    }
    if (hostname.includes('themoviedb.org')) {
      const ip = getTmdbIp();
      if (opts && opts.all) {
        return cb(null, [{ address: ip, family: 4 }]);
      }
      return cb(null, ip, 4);
    }
    if (hostname.includes('tmdb.org')) {
      const ip = TMDB_IMAGE_IPS[0];
      if (opts && opts.all) {
        return cb(null, [{ address: ip, family: 4 }]);
      }
      return cb(null, ip, 4);
    }
    const dns = require('dns');
    return dns.lookup(hostname, opts, cb);
  },
  keepAlive: true,
  timeout: 8000
});

const tmdbClient = axios.create({
  httpsAgent: tmdbAgent,
  timeout: 8000,
  headers: {
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
  }
});

const API_KEY = process.env.TMDB_API_KEY || '3fd2be6f0c70a2a598f084ddfb75487c';
const CACHE_DIR = path.join(process.cwd(), 'data', 'cache', 'tmdb');

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function extractSearchCandidates(rawTitle) {
  if (!rawTitle) return { candidates: [], year: null };

  const yearMatch = rawTitle.match(/\((\d{4})\)/);
  const year = yearMatch ? yearMatch[1] : null;

  const lines = rawTitle.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
  const candidates = [];

  for (const line of lines) {
    // 1. Remove izle, dublaj, altyazi, season/bolum words
    const cleaned = line
      .replace(/\s*(?:izle|dizi|film|türkçe\s*dublaj|altyazılı|hd).*$/gi, '')
      .replace(/\(\d{4}\)/g, '')
      .trim();

    if (cleaned && !candidates.includes(cleaned)) {
      candidates.push(cleaned);
    }

    // 2. Also check if there's a dash like "Dizi Adı - Original Name"
    if (line.includes('-')) {
      const parts = line.split('-');
      for (const p of parts) {
        const pClean = p
          .replace(/\s*(?:izle|dizi|film|türkçe\s*dublaj|altyazılı|hd).*$/gi, '')
          .replace(/\(\d{4}\)/g, '')
          .trim();
        if (pClean && pClean.length > 2 && !candidates.includes(pClean)) {
          candidates.push(pClean);
        }
      }
    }
  }

  return { candidates, year };
}

/**
 * TMDb'den dizi veya film metadatasını ve oyuncu kadrosunu çeker.
 */
async function getTmdbMetadata(rawTitle, isMovieHint = false) {
  if (!rawTitle || typeof rawTitle !== 'string') return null;

  const { candidates, year } = extractSearchCandidates(rawTitle);
  if (!candidates || candidates.length === 0) return null;

  ensureCacheDir();
  const cacheKey = crypto.createHash('md5').update(`${candidates[0]}_${year}_${isMovieHint}`).digest('hex');
  const cacheFile = path.join(CACHE_DIR, `${cacheKey}.json`);

  // 1. Önbellek kontrolü (7 gün geçerli)
  if (fs.existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (Date.now() - cached.cachedAt < 7 * 24 * 60 * 60 * 1000) {
        return cached.data;
      }
    } catch (e) {}
  }

  try {
    const endpoints = isMovieHint ? ['movie', 'tv'] : ['tv', 'movie'];
    let foundItem = null;
    let activeEndpoint = isMovieHint ? 'movie' : 'tv';

    for (const query of candidates) {
      for (const ep of endpoints) {
        // Önce yıl filtresi ile dene
        if (year) {
          const yearParam = ep === 'tv' ? `&first_air_date_year=${year}` : `&year=${year}`;
          const urlWithYear = `https://api.themoviedb.org/3/search/${ep}?api_key=${API_KEY}&query=${encodeURIComponent(query)}&language=tr-TR${yearParam}`;
          try {
            const res = await tmdbClient.get(urlWithYear);
            if (res.data?.results?.length > 0) {
              foundItem = res.data.results[0];
              activeEndpoint = ep;
              break;
            }
          } catch (e) {}
        }

        // Yılsız ara
        const urlWithoutYear = `https://api.themoviedb.org/3/search/${ep}?api_key=${API_KEY}&query=${encodeURIComponent(query)}&language=tr-TR`;
        try {
          const res = await tmdbClient.get(urlWithoutYear);
          if (res.data?.results?.length > 0) {
            foundItem = res.data.results[0];
            activeEndpoint = ep;
            break;
          }
        } catch (e) {}
      }

      if (foundItem) break;
    }

    if (!foundItem) {
      return null;
    }

    const first = foundItem;

    // Detayları ve Oyuncuları (Credits) çek
    const detailsUrl = `https://api.themoviedb.org/3/${activeEndpoint}/${first.id}?api_key=${API_KEY}&language=tr-TR&append_to_response=credits`;
    const detailsRes = await tmdbClient.get(detailsUrl);
    const data = detailsRes.data;

    // Oyuncu kadrosu (ilk 16 ana oyuncu)
    const cast = (data.credits?.cast || []).slice(0, 16).map(c => ({
      id: c.id,
      name: c.name,
      character: c.character || '',
      profilePath: c.profile_path ? `/api/proxy/tmdb-image?path=${encodeURIComponent(c.profile_path)}&size=w185` : null
    }));

    // Yönetmen / Yaratıcı
    const directors = (data.credits?.crew || [])
      .filter(cr => cr.job === 'Director' || cr.job === 'Creator' || cr.department === 'Directing')
      .slice(0, 3)
      .map(cr => cr.name);

    const metadata = {
      tmdbId: data.id,
      mediaType: activeEndpoint,
      title: data.name || data.title,
      originalTitle: data.original_name || data.original_title,
      overview: data.overview || first.overview || '',
      tagline: data.tagline || '',
      rating: data.vote_average ? Number(data.vote_average.toFixed(1)) : null,
      voteCount: data.vote_count || 0,
      genres: (data.genres || []).map(g => g.name),
      releaseDate: data.first_air_date || data.release_date || '',
      status: data.status || '',
      directors: directors,
      backdropUrl: data.backdrop_path ? `/api/proxy/tmdb-image?path=${encodeURIComponent(data.backdrop_path)}&size=w1280` : null,
      posterUrl: data.poster_path ? `/api/proxy/tmdb-image?path=${encodeURIComponent(data.poster_path)}&size=w500` : null,
      cast: cast
    };

    // Önbelleğe kaydet
    try {
      fs.writeFileSync(cacheFile, JSON.stringify({ cachedAt: Date.now(), data: metadata }, null, 2), 'utf8');
    } catch (err) {}

    return metadata;
  } catch (err) {
    console.error(`[TMDb Error] ${rawTitle}:`, err.message);
    return null;
  }
}

module.exports = {
  getTmdbMetadata,
  tmdbClient,
  tmdbAgent
};
