const axios = require('axios');

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

function resolveUrl(relativeOrAbsolute, base) {
  try {
    return new URL(relativeOrAbsolute, base).href;
  } catch (e) {
    return relativeOrAbsolute;
  }
}

/**
 * .m3u8 veya .txt playlist manifestini indirir ve içindeki URI'leri /api/proxy rotalarına yeniden yazar.
 */
async function rewritePlaylist(targetUrl) {
  const response = await axios.get(targetUrl, {
    headers: DEFAULT_HEADERS,
    responseType: 'text',
    timeout: 12000
  });

  const manifestContent = response.data;
  const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);

  const lines = manifestContent.split(/\r?\n/);
  const rewrittenLines = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    // 1. Yorum Satırları / Etiketler
    if (trimmed.startsWith('#')) {
      // Ses Parçaları (EXT-X-MEDIA:TYPE=AUDIO,URI="sublist_aud1.txt")
      if (trimmed.includes('URI="')) {
        return trimmed.replace(/URI="([^"]+)"/g, (match, uri) => {
          const absoluteAudioUrl = resolveUrl(uri, baseUrl);
          return `URI="/api/proxy/playlist?url=${encodeURIComponent(absoluteAudioUrl)}"`;
        });
      }

      // Çoklu ses / video codec çakışmasını engelleme
      if (trimmed.startsWith('#EXT-X-STREAM-INF') && trimmed.includes('AUDIO=')) {
        return trimmed.replace(/CODECS="([^"]+)"/, (match, codecs) => {
          const videoCodecsOnly = codecs.split(',').filter(c => !c.trim().startsWith('mp4a')).join(',');
          return videoCodecsOnly ? `CODECS="${videoCodecsOnly}"` : match;
        });
      }

      return line;
    }

    // 2. Alt Liste veya Segment Satırları
    const absoluteUrl = resolveUrl(trimmed, baseUrl);

    if (trimmed.endsWith('.m3u8') || trimmed.endsWith('.txt')) {
      return `/api/proxy/playlist?url=${encodeURIComponent(absoluteUrl)}`;
    }

    return `/api/proxy/segment?url=${encodeURIComponent(absoluteUrl)}`;
  });

  return rewrittenLines.join('\n');
}

/**
 * Segment dosyasını stream olarak çeker.
 */
async function fetchSegment(targetUrl) {
  return await axios({
    method: 'GET',
    url: targetUrl,
    headers: DEFAULT_HEADERS,
    responseType: 'stream',
    timeout: 20000
  });
}

module.exports = {
  DEFAULT_HEADERS,
  rewritePlaylist,
  fetchSegment,
  resolveUrl
};
