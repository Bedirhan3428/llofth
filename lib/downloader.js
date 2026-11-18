const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const http = require('http');
const https = require('https');
const axios = require('axios');
const { resolveStreamUrl } = require('./scraper');
const { DEFAULT_HEADERS } = require('./hls-proxy');

// Geçici çalışma alanı: env > Windows'ta D: sürücüsü > proje klasörü
function resolveDownloadDir() {
  if (process.env.LLOFTH_DOWNLOAD_DIR) return process.env.LLOFTH_DOWNLOAD_DIR;
  if (process.platform === 'win32') {
    try {
      if (fs.existsSync('D:\\')) return 'D:\\llofth\\downloads';
    } catch (e) {}
  }
  return path.join(process.cwd(), 'data', 'downloads');
}

const DOWNLOAD_DIR = resolveDownloadDir();
const TMP_DIR = path.join(DOWNLOAD_DIR, '.tmp');
const SEGMENT_RETRIES = 8;
const FILE_TTL_MS = 60 * 60 * 1000;
const MIN_FREE_BYTES = 512 * 1024 * 1024;
const MAX_PARALLEL_JOBS = 2;
const WORKERS_PER_TRACK = 32;
const MAX_BUFFERED_SEGMENTS = 128;

// Bağlantıları yeniden kullan: her segment için yeni TCP/TLS el sıkışmasını önler
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 64, maxFreeSockets: 32 });
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 64, maxFreeSockets: 32 });
const AGENTS = { httpsAgent, httpAgent };

/**
 * Tüm indirmelerin paylaştığı uyarlanabilir eşzamanlılık sınırı (AIMD):
 * başarılı istekte kademeli artar, CDN 429/503 dönerse yarıya iner ve Retry-After kadar bekler.
 */
class AdaptiveLimiter {
  constructor({ initial = 24, min = 4, max = 48 } = {}) {
    this.limit = initial;
    this.min = min;
    this.max = max;
    this.active = 0;
    this.waiters = [];
    this.okStreak = 0;
    this.pausedUntil = 0;
  }

  async acquire() {
    for (;;) {
      const pause = this.pausedUntil - Date.now();
      if (pause > 0) {
        await new Promise(r => setTimeout(r, pause));
        continue;
      }
      if (this.active < this.limit) {
        this.active++;
        return;
      }
      await new Promise(r => this.waiters.push(r));
    }
  }

  release() {
    this.active--;
    const next = this.waiters.shift();
    if (next) next();
  }

  onSuccess() {
    if (++this.okStreak >= Math.max(4, this.limit / 2)) {
      this.okStreak = 0;
      if (this.limit < this.max) {
        this.limit++;
        const next = this.waiters.shift();
        if (next) next();
      }
    }
  }

  onThrottle(waitMs) {
    this.okStreak = 0;
    this.limit = Math.max(this.min, Math.floor(this.limit / 2));
    this.pausedUntil = Math.max(this.pausedUntil, Date.now() + waitMs);
  }
}

// Next.js route modülleri ayrı örneklenebildiği için durum global tutulur
const state = globalThis.__llofthDownloader || (globalThis.__llofthDownloader = {
  jobs: new Map(),
  queue: [],
  running: 0,
  reservedBytes: 0,
  initialized: false
});
if (!state.limiter || state.limiter.max !== 48) state.limiter = new AdaptiveLimiter({ initial: 24, min: 4, max: 48 });
const jobs = state.jobs;

function initOnce() {
  if (state.initialized) return;
  state.initialized = true;
  // Önceki oturumdan kalan yarım/teslim edilmemiş dosyaları temizle (yalnızca bu modülün ürettikleri)
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch (e) {}
  try {
    for (const name of fs.readdirSync(DOWNLOAD_DIR)) {
      if (/^[0-9a-f]{16}\.mp4$/.test(name)) fs.rmSync(path.join(DOWNLOAD_DIR, name), { force: true });
    }
  } catch (e) {}
  const sweep = setInterval(sweepExpired, 10 * 60 * 1000);
  if (sweep.unref) sweep.unref();
}

function deleteJobFile(job) {
  if (job.filePath) {
    fs.rm(job.filePath, { force: true }, () => {});
    job.filePath = null;
  }
}

function sweepExpired() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    const age = now - (job.finishedAt || job.createdAt);
    if ((job.status === 'done' || job.status === 'error' || job.status === 'delivered') && age > FILE_TTL_MS) {
      deleteJobFile(job);
      jobs.delete(id);
    }
  }
}

function getFreeBytes(dir) {
  try {
    const s = fs.statfsSync(dir);
    return s.bavail * s.bsize;
  } catch (e) {
    return Infinity;
  }
}

const LANG_CODES = {
  'türkçe': 'tur', 'turkish': 'tur',
  'ingilizce': 'eng', 'english': 'eng',
  'fransızca': 'fre', 'french': 'fre',
  'ispanyolca': 'spa', 'spanish': 'spa',
  'almanca': 'ger', 'german': 'ger',
  'portekizce': 'por', 'portuguese': 'por',
  'italyanca': 'ita', 'italian': 'ita',
  'rusça': 'rus', 'russian': 'rus'
};

function getFfmpegPath() {
  const bin = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const local = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', bin);
  return fs.existsSync(local) ? local : 'ffmpeg';
}

function sanitizeFileName(name) {
  return (name || 'video')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150) || 'video';
}

function parseAttributes(line) {
  const attrs = {};
  const body = line.substring(line.indexOf(':') + 1);
  const re = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    attrs[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return attrs;
}

async function fetchText(url) {
  const res = await axios.get(url, { headers: DEFAULT_HEADERS, responseType: 'text', timeout: 15000, ...AGENTS });
  return String(res.data);
}

/**
 * Master playlist'ten en yüksek çözünürlüklü video varyantını ve ona bağlı ses parçalarını seçer.
 */
async function pickBestRenditions(masterUrl) {
  const text = await fetchText(masterUrl);
  const lines = text.split(/\r?\n/).map(l => l.trim());

  if (!lines.some(l => l.startsWith('#EXT-X-STREAM-INF'))) {
    return { videoUrl: masterUrl, height: 0, audios: [], videoHasAudio: true };
  }

  const variants = [];
  const audioMedia = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#EXT-X-MEDIA') && /TYPE=AUDIO/.test(line)) {
      const a = parseAttributes(line);
      if (a.URI) {
        audioMedia.push({
          groupId: a['GROUP-ID'],
          name: a.NAME || 'Ses',
          language: a.LANGUAGE || '',
          isDefault: a.DEFAULT === 'YES',
          url: new URL(a.URI, masterUrl).href
        });
      }
    } else if (line.startsWith('#EXT-X-STREAM-INF')) {
      const a = parseAttributes(line);
      let uri = '';
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j] && !lines[j].startsWith('#')) { uri = lines[j]; break; }
      }
      if (!uri) continue;
      const height = a.RESOLUTION ? parseInt(a.RESOLUTION.split('x')[1], 10) || 0 : 0;
      variants.push({
        url: new URL(uri, masterUrl).href,
        bandwidth: parseInt(a.BANDWIDTH, 10) || 0,
        height,
        audioGroup: a.AUDIO || null
      });
    }
  }

  if (variants.length === 0) throw new Error('Video varyantı bulunamadı.');

  variants.sort((x, y) => (y.height - x.height) || (y.bandwidth - x.bandwidth));
  const best = variants[0];

  const audios = audioMedia
    .filter(a => !best.audioGroup || a.groupId === best.audioGroup)
    .sort((x, y) => Number(y.isDefault) - Number(x.isDefault));

  return { videoUrl: best.url, height: best.height, bandwidth: best.bandwidth, audios, videoHasAudio: audios.length === 0 };
}

async function getSegmentUrls(mediaUrl) {
  const text = await fetchText(mediaUrl);
  if (/#EXT-X-KEY:.*METHOD=(?!NONE)/.test(text)) {
    throw new Error('Şifreli akış indirilemiyor.');
  }
  const lines = text.split(/\r?\n/).map(l => l.trim());
  const urls = lines
    .filter(l => l && !l.startsWith('#'))
    .map(l => new URL(l, mediaUrl).href);
  urls.duration = lines
    .filter(l => l.startsWith('#EXTINF:'))
    .reduce((sum, l) => sum + (parseFloat(l.substring(8)) || 0), 0);
  return urls;
}

async function fetchSegment(url) {
  const limiter = state.limiter;
  let lastErr;
  for (let attempt = 0; attempt < SEGMENT_RETRIES; attempt++) {
    await limiter.acquire();
    try {
      const res = await axios.get(url, {
        headers: DEFAULT_HEADERS,
        responseType: 'arraybuffer',
        timeout: 15000,
        maxRedirects: 3,
        ...AGENTS
      });
      limiter.release();
      limiter.onSuccess();
      return Buffer.isBuffer(res.data) ? res.data : Buffer.from(res.data);
    } catch (err) {
      limiter.release();
      lastErr = err;
      const status = err.response?.status;
      if (status === 429 || status === 503) {
        const retryAfter = parseInt(err.response.headers?.['retry-after'], 10);
        limiter.onThrottle(Number.isFinite(retryAfter) ? retryAfter * 1000 : 3000);
      } else {
        await new Promise(r => setTimeout(r, Math.min(500 * 2 ** attempt, 5000)));
      }
    }
  }
  throw new Error(`Segment indirilemedi: ${lastErr?.message || url}`);
}

/**
 * Segmentleri paralel indirir, sırayı koruyarak tek bir TS dosyasına yazar.
 */
async function downloadSegmentsToFile(urls, outFile, job, onSegmentDone) {
  const out = fs.createWriteStream(outFile);
  const buffers = new Map();
  let nextIndex = 0;
  let writeIndex = 0;

  const flush = async () => {
    while (buffers.has(writeIndex)) {
      const buf = buffers.get(writeIndex);
      buffers.delete(writeIndex);
      writeIndex++;
      if (!out.write(buf)) {
        await new Promise(r => out.once('drain', r));
      }
    }
  };

  const worker = async () => {
    while (nextIndex < urls.length) {
      if (job.cancelled) throw new Error('İndirme iptal edildi.');
      // Yavaş bir segment yüzünden tamponlanan veri şişmesin
      while (buffers.size >= MAX_BUFFERED_SEGMENTS && !job.cancelled) {
        await new Promise(r => setTimeout(r, 50));
      }
      const idx = nextIndex++;
      const buf = await fetchSegment(urls[idx]);
      buffers.set(idx, buf);
      onSegmentDone();
      await flush();
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(WORKERS_PER_TRACK, urls.length) }, worker));
    await flush();
  } finally {
    await new Promise(r => out.end(r));
  }
}

async function downloadSubtitles(subtitles, workDir) {
  const result = [];
  for (let i = 0; i < subtitles.length; i++) {
    const s = subtitles[i];
    if (!s.rawUrl) continue;
    try {
      const res = await axios.get(s.rawUrl, { headers: DEFAULT_HEADERS, responseType: 'text', timeout: 15000 });
      const body = String(res.data);
      if (!body.includes('-->')) continue;
      const file = path.join(workDir, `sub_${i}.vtt`);
      fs.writeFileSync(file, body.startsWith('WEBVTT') ? body : `WEBVTT\n\n${body}`, 'utf8');
      result.push({ file, label: s.label, isDefault: !!s.default });
    } catch (e) {}
  }
  return result;
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(getFfmpegPath(), args, { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', d => { stderr = (stderr + d.toString()).slice(-4000); });
    proc.on('error', reject);
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg çıkış kodu ${code}: ${stderr.split('\n').slice(-4).join(' ')}`));
    });
  });
}

/**
 * Video, tüm ses parçaları ve altyazıları yeniden kodlamadan (stream copy) MP4'e paketler.
 */
async function muxToMp4({ videoFile, audioTracks, subtitleTracks, videoHasAudio, outFile }) {
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', videoFile];
  audioTracks.forEach(a => args.push('-i', a.file));
  subtitleTracks.forEach(s => args.push('-i', s.file));

  args.push('-map', '0:v:0');
  if (videoHasAudio) args.push('-map', '0:a?');
  audioTracks.forEach((_, i) => args.push('-map', `${i + 1}:a:0`));
  subtitleTracks.forEach((_, i) => args.push('-map', `${audioTracks.length + 1 + i}:0`));

  args.push('-c:v', 'copy', '-c:a', 'copy', '-bsf:a', 'aac_adtstoasc');
  if (subtitleTracks.length) args.push('-c:s', 'mov_text');

  audioTracks.forEach((a, i) => {
    const lang = a.language || LANG_CODES[(a.name || '').toLowerCase()] || 'und';
    const title = lang === 'tur' ? 'Türkçe' : (/original/i.test(a.name) ? 'Orijinal' : a.name);
    args.push(`-metadata:s:a:${i}`, `language=${lang}`, `-metadata:s:a:${i}`, `title=${title}`);
    args.push(`-disposition:a:${i}`, i === 0 ? 'default' : '0');
  });

  subtitleTracks.forEach((s, i) => {
    const lang = LANG_CODES[(s.label || '').toLowerCase()] || 'und';
    args.push(`-metadata:s:s:${i}`, `language=${lang}`, `-metadata:s:s:${i}`, `title=${s.label}`);
    args.push(`-disposition:s:${i}`, '0');
  });

  args.push('-movflags', '+faststart', outFile);
  await runFfmpeg(args);
}

async function runJob(job) {
  const workDir = path.join(TMP_DIR, job.id);
  fs.mkdirSync(workDir, { recursive: true });
  let reserved = 0;

  try {
    job.status = 'resolving';
    const stream = await resolveStreamUrl(job.pageUrl);
    const renditions = await pickBestRenditions(stream.rawM3u8);
    job.quality = renditions.height ? `${renditions.height}p` : '';

    const videoSegments = await getSegmentUrls(renditions.videoUrl);
    const audioSegmentLists = await Promise.all(renditions.audios.map(a => getSegmentUrls(a.url)));

    const totalSegments = videoSegments.length + audioSegmentLists.reduce((n, l) => n + l.length, 0);

    // Geçici TS + MP4 aynı anda diskte duracağı için tahmini boyutun ~2.2 katı boş alan gerekir.
    // Paralel çalışan diğer işlerin ayırdığı alan da düşülür.
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
    const estimatedBytes = (renditions.bandwidth / 8) * (videoSegments.duration || 0);
    const requiredBytes = estimatedBytes * 2.2 + MIN_FREE_BYTES;
    const freeBytes = getFreeBytes(DOWNLOAD_DIR) - state.reservedBytes;
    if (freeBytes < requiredBytes) {
      const needGb = (requiredBytes / 1024 ** 3).toFixed(1);
      const freeGb = (Math.max(0, freeBytes) / 1024 ** 3).toFixed(1);
      throw new Error(`Diskte yeterli yer yok (gerekli ~${needGb} GB, boş ${freeGb} GB).`);
    }
    reserved = requiredBytes;
    state.reservedBytes += reserved;

    let doneSegments = 0;
    const tick = () => {
      doneSegments++;
      job.progress = Math.min(99, Math.floor((doneSegments / totalSegments) * 99));
    };

    job.status = 'downloading';
    const videoFile = path.join(workDir, 'video.ts');
    const audioTracks = renditions.audios.map((a, i) => ({ ...a, file: path.join(workDir, `audio_${i}.ts`) }));

    // Video, ses parçaları ve altyazılar ortak limiter üzerinden eşzamanlı iner
    const [, , subtitleTracks] = await Promise.all([
      downloadSegmentsToFile(videoSegments, videoFile, job, tick),
      Promise.all(audioTracks.map((a, i) => downloadSegmentsToFile(audioSegmentLists[i], a.file, job, tick))),
      downloadSubtitles(stream.subtitles || [], workDir)
    ]);

    job.status = 'muxing';
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
    const outFile = path.join(DOWNLOAD_DIR, `${job.id}.mp4`);
    const muxBase = { videoFile, audioTracks, videoHasAudio: renditions.videoHasAudio, outFile };

    try {
      await muxToMp4({ ...muxBase, subtitleTracks });
    } catch (err) {
      if (!subtitleTracks.length) throw err;
      await muxToMp4({ ...muxBase, subtitleTracks: [] });
    }

    job.filePath = outFile;
    job.fileSize = fs.statSync(outFile).size;
    job.progress = 100;
    job.status = 'done';
  } catch (err) {
    job.cancelled = true; // paralel parçaların kalan işçilerini durdur
    job.status = 'error';
    job.error = err.message;
    console.error(`[Downloader] ${job.pageUrl} ->`, err.message);
  } finally {
    job.finishedAt = Date.now();
    state.reservedBytes = Math.max(0, state.reservedBytes - reserved);
    fs.rm(workDir, { recursive: true, force: true }, () => {});
  }
}

// En fazla MAX_PARALLEL_JOBS iş aynı anda; CDN yükünü ortak limiter dengeler
function processQueue() {
  while (state.running < MAX_PARALLEL_JOBS && state.queue.length) {
    const job = jobs.get(state.queue.shift());
    if (!job || job.status !== 'queued') continue;
    state.running++;
    runJob(job).finally(() => {
      state.running--;
      processQueue();
    });
  }
}

/**
 * Dosya cihaza tamamen gönderildikten sonra sunucudaki kopyayı siler.
 */
function markDelivered(id) {
  const job = jobs.get(id);
  if (!job) return;
  deleteJobFile(job);
  job.status = 'delivered';
  job.finishedAt = Date.now();
}

function publicJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    pageUrl: job.pageUrl,
    fileName: job.fileName,
    status: job.status,
    progress: job.progress,
    quality: job.quality,
    fileSize: job.fileSize || 0,
    error: job.error || null
  };
}

function startDownload({ pageUrl, title }) {
  if (!pageUrl) throw new Error('pageUrl zorunludur.');
  initOnce();

  for (const existing of jobs.values()) {
    if (existing.pageUrl !== pageUrl) continue;
    if (['queued', 'resolving', 'downloading', 'muxing'].includes(existing.status)) {
      return publicJob(existing);
    }
    if (existing.status === 'done' && existing.filePath && fs.existsSync(existing.filePath)) {
      return publicJob(existing);
    }
  }

  const job = {
    id: crypto.randomBytes(8).toString('hex'),
    pageUrl,
    fileName: `${sanitizeFileName(title)}.mp4`,
    status: 'queued',
    progress: 0,
    quality: '',
    createdAt: Date.now(),
    cancelled: false
  };
  jobs.set(job.id, job);
  state.queue.push(job.id);
  processQueue();
  return publicJob(job);
}

function getJob(id) {
  return jobs.get(id) || null;
}

module.exports = {
  startDownload,
  getJob,
  publicJob,
  markDelivered,
  pickBestRenditions,
  DOWNLOAD_DIR
};
