import { NextResponse } from 'next/server';
import { remoteHub } from '@/lib/remoteHub';
import { searchContent, scrapeSeries } from '@/lib/scraper';

export const dynamic = 'force-dynamic';

/**
 * Türkçe Doğal Dil Komutlarını Ayrıştırıcı (Gemini & Google Home için)
 */
function parseVoiceCommand(rawText, defaultDevice = null) {
  if (!rawText || typeof rawText !== 'string') return null;

  let text = rawText.trim().toLowerCase();
  let deviceId = defaultDevice;

  // 1. Cümle içinde cihaz adı geçiyor mu? (Örn: "salonda durdur", "tv de avatar aç", "yatak odasında sonraki bölüm")
  const devicePatterns = [
    { regex: /(?:salonda|salon|salondaki|salondaki tv(?:de)?)\s*/i, id: 'SALON' },
    { regex: /(?:yatak odas[ıi]nda|yatak odas[ıi]|yatakodas[ıi])\s*/i, id: 'YATAK_ODASI' },
    { regex: /(?:oturma odas[ıi]nda|oturma odas[ıi])\s*/i, id: 'OTURMA_ODASI' },
    { regex: /(?:tv(?:'de|de)?|televizyonda|ekranda)\s*/i, id: 'SALON' }
  ];

  for (const { regex, id } of devicePatterns) {
    if (regex.test(text)) {
      deviceId = id;
      text = text.replace(regex, ' ').trim();
      break;
    }
  }

  // 2. Oynatma / Duraklatma
  if (/\b(durdur|dur|duraklat|beklet|pause|stop|dursun)\b/i.test(text)) {
    return { action: 'pause', deviceId, message: 'Oynatma duraklatıldı' };
  }
  if (/\b(oynat|başlat|devam et|sürdür|play|resume|devam)\b/i.test(text)) {
    return { action: 'play', deviceId, message: 'Oynatma başlatıldı' };
  }

  // 3. Bölüm Değiştirme
  if (/\b(sonraki bölüm|diğer bölüm|ileri bölüm|next episode|bir sonraki bölüm)\b/i.test(text)) {
    return { action: 'next_episode', deviceId, message: 'Sonraki bölüme geçiliyor' };
  }
  if (/\b(önceki bölüm|bir önceki bölüm|geri bölüm|prev episode)\b/i.test(text)) {
    return { action: 'prev_episode', deviceId, message: 'Önceki bölüme geçiliyor' };
  }

  // 4. İleri / Geri Sarma
  const forwardMatch = text.match(/(\d+)\s*(?:saniye|dakika|sn|dk)?\s*(?:ileri|sar|ileriye)/i);
  if (forwardMatch) {
    const num = parseInt(forwardMatch[1], 10);
    const isMinute = text.includes('dakika') || text.includes('dk');
    const seconds = isMinute ? num * 60 : num;
    return { action: 'seek', payload: { delta: seconds }, deviceId, message: `${num} ${isMinute ? 'dakika' : 'saniye'} ileri sarıldı` };
  }
  if (/\b(ileri sar|ileriye al|ileri git|hızlı sar)\b/i.test(text)) {
    return { action: 'seek', payload: { delta: 15 }, deviceId, message: '15 saniye ileri sarıldı' };
  }

  const backwardMatch = text.match(/(\d+)\s*(?:saniye|dakika|sn|dk)?\s*(?:geri|sar|geriye)/i);
  if (backwardMatch) {
    const num = parseInt(backwardMatch[1], 10);
    const isMinute = text.includes('dakika') || text.includes('dk');
    const seconds = isMinute ? num * 60 : num;
    return { action: 'seek', payload: { delta: -seconds }, deviceId, message: `${num} ${isMinute ? 'dakika' : 'saniye'} geri sarıldı` };
  }
  if (/\b(geri sar|geriye al|geri git)\b/i.test(text)) {
    return { action: 'seek', payload: { delta: -15 }, deviceId, message: '15 saniye geri sarıldı' };
  }

  // 5. Tam Ekran
  if (/\b(tam ekrandan çık|küçült|exit fullscreen)\b/i.test(text)) {
    return { action: 'exit_fullscreen', deviceId, message: 'Tam ekrandan çıkıldı' };
  }
  if (/\b(tam ekran|tam ekran yap|büyüt|fullscreen)\b/i.test(text)) {
    return { action: 'fullscreen', deviceId, message: 'Tam ekran moduna geçildi' };
  }

  // 6. Ses Kontrolleri
  if (/\b(sesi aç|ses aç|ses yükselt|sesi artır|ses artır|volume up)\b/i.test(text)) {
    return { action: 'volume_up', payload: { delta: 0.15 }, deviceId, message: 'Ses yükseltildi' };
  }
  if (/\b(sesi kıs|ses kıs|ses alçalt|sesi azalt|ses azalt|volume down)\b/i.test(text)) {
    return { action: 'volume_down', payload: { delta: -0.15 }, deviceId, message: 'Ses kısıldı' };
  }
  if (/\b(sessize al|sustur|sesi kapat|mute|sessiz)\b/i.test(text)) {
    return { action: 'mute', deviceId, message: 'Sessize alındı' };
  }

  // 7. Dil & Altyazı
  if (/\b(ses dili|dublaj|dili değiştir|orijinal ses|türkçe dublaj)\b/i.test(text)) {
    return { action: 'toggle_audio', deviceId, message: 'Ses dili değiştirildi' };
  }
  if (/\b(altyazı|altyazıyı aç|altyazıyı kapat|altyazı değiştir)\b/i.test(text)) {
    return { action: 'toggle_subtitle', deviceId, message: 'Altyazı durumu değiştirildi' };
  }

  // 8. Film / Dizi Arama ve Açma Komutu (Örn: "Avatar aç", "Inception filmini izle", "Dune 2 oynat")
  const openMatch = text.match(/(.+?)\s+(?:filmini|dizisini|filmi|dizisi|bölümünü)?\s*(?:aç|oynat|başlat|izle|izlet)$/i) ||
                    text.match(/^(?:aç|oynat|izle|izlet)\s+(.+)$/i);

  if (openMatch) {
    const rawQuery = (openMatch[1] || '').trim();
    // Gereksiz dolgu kelimelerini temizle
    const cleanQuery = rawQuery
      .replace(/^(şu\s+|bana\s+|lütfen\s+|hemen\s+)/i, '')
      .replace(/\s+(filmini|dizisini|filmi|dizisi)$/i, '')
      .trim();

    if (cleanQuery.length > 1) {
      return {
        action: 'open_content',
        query: cleanQuery,
        deviceId,
        message: `"${cleanQuery}" aranıyor ve açılıyor`
      };
    }
  }

  // Komut doğrudan bir film ismi olarak söylenmişse (Örn: "Interstellar", "Kurtlar Vadisi")
  if (text.length > 2 && !text.includes('nasıl') && !text.includes('hava') && !text.includes('saat')) {
    return {
      action: 'open_content',
      query: text,
      deviceId,
      message: `"${text}" aranıyor ve açılıyor`
    };
  }

  return null;
}

/**
 * İçerik Arama ve TV URL'i Hazırlama Motoru
 */
async function resolveAndPrepareContent(query) {
  // Örn: "The Mentalist 2. Sezon 4. Bölüm"
  const seasonEpMatch = query.match(/(.+?)\s+(\d+)\s*\.?\s*sezon\s+(\d+)\s*\.?\s*bölüm/i);
  let targetSeason = null;
  let targetEpisode = null;
  let searchQuery = query;

  if (seasonEpMatch) {
    searchQuery = seasonEpMatch[1].trim();
    targetSeason = parseInt(seasonEpMatch[2], 10);
    targetEpisode = parseInt(seasonEpMatch[3], 10);
  }

  console.log(`[RemoteCommand] İçerik aranıyor: "${searchQuery}" (Sezon: ${targetSeason}, Bölüm: ${targetEpisode})`);
  const searchResults = await searchContent(searchQuery);

  if (!searchResults || searchResults.length === 0) {
    return null;
  }

  // İlk ve en iyi eşleşmeyi al
  const bestMatch = searchResults[0];
  let targetUrl = `/watch?url=${encodeURIComponent(bestMatch.url)}&title=${encodeURIComponent(bestMatch.title)}`;

  // Eğer belirli bir sezon ve bölüm istendiyse, dizi ağacını çekip spesifik bölümü bul
  if (bestMatch.type === 'Dizi' && targetSeason !== null && targetEpisode !== null) {
    try {
      const seriesDetails = await scrapeSeries(bestMatch.url);
      if (seriesDetails && seriesDetails.seasons) {
        const seasonObj = seriesDetails.seasons.find(s => s.seasonNumber === targetSeason) ||
                          seriesDetails.seasons[targetSeason - 1];
        if (seasonObj && seasonObj.episodes) {
          const epObj = seasonObj.episodes.find(e => e.episodeNumber === targetEpisode) ||
                        seasonObj.episodes[targetEpisode - 1];
          if (epObj) {
            targetUrl = `/watch?url=${encodeURIComponent(bestMatch.url)}&epUrl=${encodeURIComponent(epObj.url)}&title=${encodeURIComponent(bestMatch.title + ' - ' + epObj.title)}`;
          }
        }
      }
    } catch (e) {
      console.error('[RemoteCommand] Sezon/bölüm çözümleme hatası:', e.message);
    }
  }

  return {
    item: bestMatch,
    watchUrl: targetUrl,
    title: bestMatch.title
  };
}

/**
 * Ortak Komut İşleyici (GET & POST destekli)
 */
async function handleCommand(req, params) {
  let {
    deviceId,
    action,
    query,
    text,
    voice,
    prompt,
    value,
    seconds,
    delta,
    url
  } = params;

  // Sesli komut metni varsa doğal dil analizi yap
  const voiceText = text || voice || prompt;
  if (voiceText) {
    const parsed = parseVoiceCommand(voiceText, deviceId);
    if (parsed) {
      action = parsed.action;
      if (parsed.deviceId) deviceId = parsed.deviceId;
      if (parsed.query) query = parsed.query;
      if (parsed.payload) {
        delta = parsed.payload.delta;
      }
    }
  }

  // 1. Durum Sorgusu / Cihaz Listesi
  if (action === 'list_devices' || action === 'devices') {
    const activeList = remoteHub.getActiveDevices();
    return NextResponse.json({
      success: true,
      devices: activeList,
      count: activeList.length
    });
  }

  // 2. Cihaz Durum Bildirimi (Oynatıcıdan gelen durum güncellemesi)
  if (action === 'report_state') {
    remoteHub.updateDeviceState(deviceId, params.state || {});
    return NextResponse.json({ success: true, updated: deviceId });
  }

  // 3. İçerik Açma Eylemi ("open" / "open_content" / "search")
  if (action === 'open' || action === 'open_content' || action === 'play_movie' || query) {
    const searchQuery = query || text || voiceText;
    if (!searchQuery) {
      return NextResponse.json({ success: false, error: 'Arama sorgusu belirtilmedi.' }, { status: 400 });
    }

    try {
      const resolved = await resolveAndPrepareContent(searchQuery);
      if (!resolved) {
        return NextResponse.json({
          success: false,
          error: `"${searchQuery}" için sonuç bulunamadı.`,
          message: `Maalesef "${searchQuery}" için sitede eşleşen bir film veya dizi bulunamadı.`
        }, { status: 404 });
      }

      // TV'ye URL açma emri gönder
      const sendResult = remoteHub.sendCommand(deviceId, 'navigate', {
        url: resolved.watchUrl,
        title: resolved.title,
        poster: resolved.item.poster,
        type: resolved.item.type,
        voiceFeedback: `"${resolved.title}" açılıyor`
      });

      return NextResponse.json({
        success: true,
        message: `"${resolved.title}" ${sendResult.targetDevice} ekranında açılıyor.`,
        targetDevice: sendResult.targetDevice,
        delivered: sendResult.deliveredCount > 0,
        item: resolved.item,
        watchUrl: resolved.watchUrl
      });
    } catch (err) {
      console.error('[RemoteCommand] İçerik açma hatası:', err);
      return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
  }

  // 4. Doğrudan URL Yönlendirme Eylemi
  if (action === 'navigate' || action === 'open_url') {
    if (!url) {
      return NextResponse.json({ success: false, error: 'Yönlendirme için url parametresi zorunludur.' }, { status: 400 });
    }
    const sendResult = remoteHub.sendCommand(deviceId, 'navigate', { url });
    return NextResponse.json({
      success: true,
      message: `Ekran yönlendiriliyor: ${url}`,
      targetDevice: sendResult.targetDevice,
      delivered: sendResult.deliveredCount > 0
    });
  }

  // 5. Standart Oynatıcı Kontrol Komutları
  const playerActions = [
    'play',
    'pause',
    'toggle_play',
    'seek',
    'seek_forward',
    'seek_backward',
    'next_episode',
    'prev_episode',
    'fullscreen',
    'exit_fullscreen',
    'toggle_fullscreen',
    'volume_up',
    'volume_down',
    'mute',
    'toggle_mute',
    'toggle_audio',
    'toggle_subtitle',
    'reload'
  ];

  if (playerActions.includes(action)) {
    let payload = {};
    if (delta !== undefined) payload.delta = Number(delta);
    if (seconds !== undefined) payload.delta = Number(seconds);
    if (value !== undefined) payload.value = Number(value);

    // Otomatik delta atamaları
    if (action === 'seek_forward' && !payload.delta) payload.delta = 15;
    if (action === 'seek_backward' && !payload.delta) payload.delta = -15;

    const sendResult = remoteHub.sendCommand(deviceId, action, payload);

    const friendlyMessages = {
      play: 'Oynatılıyor',
      pause: 'Durduruldu',
      toggle_play: 'Oynatma durumu değiştirildi',
      seek: `${payload.delta > 0 ? '+' : ''}${payload.delta} saniye sarıldı`,
      seek_forward: 'İleri sarıldı',
      seek_backward: 'Geri sarıldı',
      next_episode: 'Sonraki bölüme geçiliyor',
      prev_episode: 'Önceki bölüme geçiliyor',
      fullscreen: 'Tam ekran yapıldı',
      exit_fullscreen: 'Tam ekrandan çıkıldı',
      toggle_fullscreen: 'Tam ekran durumu değiştirildi',
      volume_up: 'Ses yükseltildi',
      volume_down: 'Ses kısıldı',
      mute: 'Sessize alındı',
      toggle_audio: 'Ses dili değiştirildi',
      toggle_subtitle: 'Altyazı değiştirildi',
      reload: 'Ekran yenileniyor'
    };

    const actionText = friendlyMessages[action] || action;

    return NextResponse.json({
      success: true,
      action,
      targetDevice: sendResult.targetDevice,
      delivered: sendResult.deliveredCount > 0,
      deliveredCount: sendResult.deliveredCount,
      message: `${sendResult.targetDevice} cihazında: ${actionText}`
    });
  }

  return NextResponse.json({
    success: false,
    error: `Geçersiz veya anlaşılamayan eylem: "${action || voiceText || 'boş'}".`,
    tip: 'Desteklenen eylemler: play, pause, seek, next_episode, prev_episode, fullscreen, volume_up, volume_down, mute, open (query ile) veya sesli metin (voice/text)'
  }, { status: 400 });
}

// GET Metodu (Google Asistan Webhook / Tarayıcı URL'i kolaylığı için)
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const params = Object.fromEntries(searchParams.entries());
  return handleCommand(request, params);
}

// POST Metodu (JSON Gövde desteği)
export async function POST(request) {
  try {
    let body = {};
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      body = await request.json();
    } else {
      const text = await request.text();
      try {
        body = JSON.parse(text);
      } catch (e) {
        body = { text };
      }
    }
    return handleCommand(request, body);
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
