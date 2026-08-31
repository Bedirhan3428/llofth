const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const os = require('os');
const { searchContent, scrapeSeries, resolveStreamUrl, clearCache, listCachedSeries } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// Hedef CDN korumasını aşmak için gerekli zorunlu HTTP başlıkları
const DEFAULT_HEADERS = {
  'Referer': 'https://hdfilmcehennemi.mobi/',
  'Origin': 'https://hdfilmcehennemi.mobi',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'cross-site'
};

// CORS ve JSON Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());

// İstek Loglama
app.use((req, res, next) => {
  if (req.url.startsWith('/playlist') || req.url.startsWith('/segment') || req.url.startsWith('/api')) {
    console.log(`[REQ] ${req.method} ${req.url.slice(0, 100)}...`);
  }
  next();
});

// Statik Dosyalar (Web Arayüzü)
app.use(express.static(path.join(__dirname, 'public')));

/**
 * =========================================================================
 * REST API ENDPOINTLERI (Arama, Dizi Scraper, M3U8 Resolver)
 * =========================================================================
 */

/**
 * GET /api/search?q=...
 * Hedef sitede canlı arama yapar ve bulunan dizi/filmleri döner.
 */
app.get('/api/search', async (req, res) => {
  const query = req.query.q;

  if (!query) {
    return res.status(400).json({
      success: false,
      error: 'Hata: "q" arama parametresi zorunludur. Örnek: /api/search?q=the+mentalist'
    });
  }

  try {
    const items = await searchContent(query);
    return res.json(items);
  } catch (error) {
    console.error(`[API SEARCH HATA] "${query}" ->`, error.message);
    return res.status(500).json({
      success: false,
      error: `Arama başarısız: ${error.message}`
    });
  }
});

/**
 * GET /api/resolve?pageUrl=...
 * Verilen bölüm sayfasındaki iframe ve JS kodlarını çözerek ham M3U8 ve proxy streamUrl döner.
 */
app.get('/api/resolve', async (req, res) => {
  const pageUrl = req.query.pageUrl;

  if (!pageUrl) {
    return res.status(400).json({
      success: false,
      error: 'Hata: "pageUrl" parametresi zorunludur. Örnek: /api/resolve?pageUrl=https://www.hdfilmcehennemi.nl/dizi/.../bolum-1-hd2/'
    });
  }

  try {
    const data = await resolveStreamUrl(pageUrl);
    return res.json(data);
  } catch (error) {
    console.error(`[API RESOLVE HATA] ${pageUrl} ->`, error.message);
    return res.status(500).json({
      success: false,
      error: `Akış linki çözülemedi: ${error.message}`
    });
  }
});

/**
 * GET /api/series?url=...&refresh=false
 * Verilen dizi veya bölüm linkinden tüm sezon ve bölümleri ayrıştırır.
 */
app.get('/api/series', async (req, res) => {
  const targetUrl = req.query.url;
  const forceRefresh = req.query.refresh === 'true';

  if (!targetUrl) {
    return res.status(400).json({
      success: false,
      error: 'Hata: "url" parametresi zorunludur. Örnek: /api/series?url=https://www.hdfilmcehennemi.nl/dizi/the-mentalist-izle-4/sezon-1/bolum-1-hd2/'
    });
  }

  try {
    const data = await scrapeSeries(targetUrl, forceRefresh);
    return res.json(data);
  } catch (error) {
    console.error(`[API SCRAPE HATA] ${targetUrl} ->`, error.message);
    return res.status(500).json({
      success: false,
      error: `Dizi bilgileri alınamadı: ${error.message}`
    });
  }
});

/**
 * GET /api/series/cache
 * Önbelleğe alınmış dizileri listeler.
 */
app.get('/api/series/cache', async (req, res) => {
  try {
    const list = await listCachedSeries();
    return res.json({ success: true, count: list.length, items: list });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/series/cache?url=...
 * Önbelleği temizler (tek dizi veya hepsi).
 */
app.delete('/api/series/cache', async (req, res) => {
  try {
    const result = await clearCache(req.query.url);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Göreceli (relative) URL'leri hedef base URL ile birleştirip mutlak (absolute) URL yapar.
 */
function resolveUrl(relativeOrAbsolute, baseUrl) {
  try {
    return new URL(relativeOrAbsolute, baseUrl).href;
  } catch (err) {
    return relativeOrAbsolute;
  }
}

/**
 * URL'nin bir alt çalma listesi (m3u8/txt) mi yoksa medya segmenti mi olduğunu belirler.
 */
function isPlaylistUrl(urlStr, prevTag = '') {
  const cleanUrl = urlStr.split('?')[0].toLowerCase();
  if (cleanUrl.endsWith('.m3u8') || cleanUrl.endsWith('.txt') || cleanUrl.includes('sublist')) {
    return true;
  }
  if (prevTag.startsWith('#EXT-X-STREAM-INF')) {
    return true;
  }
  return false;
}

/**
 * /playlist Endpoint: Manifest Rewriter
 * - .m3u8 veya .txt çalma listesini UTF-8 olarak indirir.
 * - Satır satır parse ederek tüm URI ve segment linklerini yerel proxy endpoint'lerine yönlendirir.
 */
app.get('/playlist', async (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).send('Hata: "url" parametresi zorunludur. Örnek: /playlist?url=https://...');
  }

  try {
    const response = await axios.get(targetUrl, {
      headers: DEFAULT_HEADERS,
      responseType: 'text',
      timeout: 15000
    });

    const lines = response.data.split(/\r?\n/);
    const rewrittenLines = [];
    let prevTag = '';

    for (let line of lines) {
      const trimmed = line.trim();

      // Boş satırları koru
      if (!trimmed) {
        rewrittenLines.push(line);
        continue;
      }

      // # ile başlayan HLS Direktifleri ve Etiketleri
      if (trimmed.startsWith('#')) {
        let modifiedLine = line;

        // 1. URI="..." içeren etiketleri dönüştür (Audio/Subtitle/I-Frame trackleri veya Anahtarlar)
        // Örnek: #EXT-X-MEDIA:TYPE=AUDIO,...,URI="sublist_aud1.txt"
        // Örnek: #EXT-X-KEY:METHOD=AES-128,URI="key.php"
        if (modifiedLine.includes('URI="')) {
          modifiedLine = modifiedLine.replace(/URI="([^"]+)"/g, (match, uriValue) => {
            const absoluteUri = resolveUrl(uriValue, targetUrl);
            if (isPlaylistUrl(uriValue)) {
              return `URI="/playlist?url=${encodeURIComponent(absoluteUri)}"`;
            } else {
              return `URI="/segment?url=${encodeURIComponent(absoluteUri)}"`;
            }
          });
        }

        // 2. #EXT-X-STREAM-INF satırında AUDIO= grubu varsa, CODECS alanından ses codec'ini (mp4a...) temizle
        // Bu sayede Hls.js ve Smart TV, video akışının (sublist_2.txt) saf video olduğunu algılar ve video decoder'ını hatasız başlatır
        if (modifiedLine.startsWith('#EXT-X-STREAM-INF') && modifiedLine.includes('AUDIO=')) {
          modifiedLine = modifiedLine.replace(/CODECS="([^"]+)"/, (cMatch, codecs) => {
            const codecList = codecs.split(',').map(c => c.trim());
            const videoCodecs = codecList.filter(c => !c.startsWith('mp4a') && !c.startsWith('ac-') && !c.startsWith('ec-'));
            if (videoCodecs.length > 0) {
              return `CODECS="${videoCodecs.join(',')}"`;
            }
            return cMatch;
          });
        }

        rewrittenLines.push(modifiedLine);
        prevTag = trimmed;
        continue;
      }

      // # ile başlamayan satırlar (URL veya dosya isimleri)
      const absoluteUrl = resolveUrl(trimmed, targetUrl);

      if (isPlaylistUrl(trimmed, prevTag)) {
        // Alt Çalma Listesi (sublist_2.txt, sublist_aud1.txt, variant.m3u8 vb.)
        rewrittenLines.push(`/playlist?url=${encodeURIComponent(absoluteUrl)}`);
      } else {
        // Medya Segmenti (image2_0.jpg, segment.ts, fragment.m4s vb.)
        rewrittenLines.push(`/segment?url=${encodeURIComponent(absoluteUrl)}`);
      }

      prevTag = '';
    }

    const rewrittenManifest = rewrittenLines.join('\n');

    res.set({
      'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    return res.send(rewrittenManifest);
  } catch (error) {
    console.error(`[PLAYLIST HATA] ${targetUrl} ->`, error.message);
    const statusCode = error.response ? error.response.status : 500;
    return res.status(statusCode).send(`Manifest yüklenemedi: ${error.message}`);
  }
});

/**
 * /segment Endpoint: Segment Proxy
 * - .jpg / .ts / .m4s segmentlerini streaming olarak çeker.
 * - Content-Type'ı zorunlu olarak 'video/mp2t' yapar.
 * - Veriyi belleğe almadan doğrudan borular (pipe).
 */
app.get('/segment', async (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).send('Hata: "url" parametresi zorunludur.');
  }

  const cancelSource = axios.CancelToken.source();

  // İstemci (TV/Tarayıcı) bağlantıyı keserse CDN indirmesini iptal et
  req.on('close', () => {
    cancelSource.cancel('İstemci bağlantıyı sonlandırdı.');
  });

  try {
    const response = await axios.get(targetUrl, {
      headers: DEFAULT_HEADERS,
      responseType: 'stream',
      timeout: 20000,
      cancelToken: cancelSource.token
    });

    // Smart TV ve Hls.js'in .jpg maskesini aşıp segmenti sorunsuz oynatması için MIME tipi zorlaması
    const responseHeaders = {
      'Content-Type': 'video/mp2t',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Cache-Control': 'public, max-age=86400',
    };

    if (response.headers['content-length']) {
      responseHeaders['Content-Length'] = response.headers['content-length'];
    }

    res.writeHead(response.status, responseHeaders);

    response.data.on('error', (err) => {
      console.error(`[SEGMENT STREAM HATA] ${targetUrl} ->`, err.message);
      if (!res.headersSent) {
        res.status(500).end();
      }
    });

    response.data.pipe(res);
  } catch (error) {
    if (axios.isCancel(error)) {
      return;
    }
    console.error(`[SEGMENT HATA] ${targetUrl} ->`, error.message);
    const statusCode = error.response ? error.response.status : 500;
    if (!res.headersSent) {
      return res.status(statusCode).send(`Segment indirilemedi: ${error.message}`);
    }
  }
});

// Yerel Ağ IP Adresini Bulan Yardımcı Fonksiyon
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Sunucuyu Başlat
app.listen(PORT, HOST, () => {
  const localIp = getLocalIpAddress();
  console.log('================================================================');
  console.log('🚀 YEREL HLS STREAM GATEWAY VE OYNATICI AKTIF');
  console.log('================================================================');
  console.log(`🌐 Bu Bilgisayarda:  http://localhost:${PORT}`);
  console.log(`📺 Smart TV / LAN:   http://${localIp}:${PORT}`);
  console.log('----------------------------------------------------------------');
  console.log('💡 TV Kumandası veya telefonunuzdan yukarıdaki LAN adresine girin.');
  console.log('================================================================\n');
});
