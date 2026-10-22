import fs from 'fs';
import path from 'path';
import { remoteHub } from './remoteHub.js';

let isInitialized = false;

const CONFIG_PATH = path.join(process.cwd(), 'sinric-config.json');

/**
 * Sinric Pro yapılandırmasını oku
 */
export function getSinricConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {}
  return {
    appKey: process.env.SINRIC_APP_KEY || '',
    appSecret: process.env.SINRIC_APP_SECRET || '',
    deviceId: process.env.SINRIC_DEVICE_ID || '',
    targetTvId: 'SALON'
  };
}

/**
 * Sinric Pro yapılandırmasını kaydet
 */
export function saveSinricConfig(config) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('[SinricService] Config kaydetme hatası:', e.message);
    return false;
  }
}

/**
 * Sinric Pro servisini başlat ve Google Home'u dinle
 */
export async function initSinricPro() {
  if (isInitialized) return;

  const config = getSinricConfig();
  if (!config.appKey || !config.appSecret || !config.deviceId) {
    console.log('[SinricService] Sinric Pro kimlik bilgileri eksik (sinric-config.json bekliyor).');
    return false;
  }

  try {
    // Dinamik import
    const { SinricPro, SinricProTV, SinricProSwitch } = await import('sinricpro');

    const targetTvId = config.targetTvId || 'SALON';
    const sinricInstance = SinricPro.getInstance();
    const myTV = new SinricProTV(config.deviceId);

    // Komutları hem bellek içi hub'a hem yerel API'ye ileten çift garantili dağıtıcı
    const dispatch = async (action, payload = {}) => {
      try {
        remoteHub.sendCommand(targetTvId, action, payload);
      } catch (e) {}

      try {
        await fetch('http://127.0.0.1:23504/api/remote/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId: targetTvId, action, ...payload })
        });
      } catch (e) {}
    };

    // 1. Oynat / Durdur / Sarma Medya Kontrolleri
    if (typeof myTV.onMediaControl === 'function') {
      myTV.onMediaControl(async (devId, control) => {
        console.log(`[SinricPro] Medya Kontrolü Alındı: ${control}`);
        const c = (control || '').toLowerCase();

        if (c === 'play' || c === 'resume') {
          await dispatch('play');
        } else if (c === 'pause' || c === 'stop') {
          await dispatch('pause');
        } else if (c === 'fastforward' || c === 'forward') {
          await dispatch('seek_forward', { delta: 15 });
        } else if (c === 'rewind' || c === 'backward') {
          await dispatch('seek_backward', { delta: -15 });
        } else if (c === 'next') {
          await dispatch('next_episode');
        } else if (c === 'previous') {
          await dispatch('prev_episode');
        }
        return true;
      });
    }

    // 2. Açma / Kapatma (Aç = Oynat, Kapat = Durdur)
    if (typeof myTV.onPowerState === 'function') {
      myTV.onPowerState(async (devId, state) => {
        console.log(`[SinricPro] Güç Durumu Değişti: ${state ? 'AÇIK (Play)' : 'KAPALI (Pause)'}`);
        await dispatch(state ? 'play' : 'pause');
        return true;
      });
    }

    // 3. Ses Açma / Kısma / Belirleme
    if (typeof myTV.onVolume === 'function') {
      myTV.onVolume(async (devId, volume) => {
        console.log(`[SinricPro] Ses Seviyesi İsteği: %${volume}`);
        const normalized = Math.max(0, Math.min(1, volume / 100));
        await dispatch('volume', { value: normalized });
        return true;
      });
    }

    if (typeof myTV.onAdjustVolume === 'function') {
      myTV.onAdjustVolume(async (devId, volumeDelta) => {
        console.log(`[SinricPro] Ses Ayarı Değişti: ${volumeDelta}`);
        if (volumeDelta > 0) {
          await dispatch('volume_up', { delta: 0.15 });
        } else {
          await dispatch('volume_down', { delta: -0.15 });
        }
        return true;
      });
    }

    // 4. Sessize Alma
    if (typeof myTV.onMute === 'function') {
      myTV.onMute(async (devId, mute) => {
        console.log(`[SinricPro] Sessiz Durumu: ${mute}`);
        await dispatch('mute');
        return true;
      });
    }

    // 5. Bölüm / Kanal Değiştirme
    if (typeof myTV.onSkipChannels === 'function') {
      myTV.onSkipChannels(async (devId, count) => {
        console.log(`[SinricPro] Bölüm Değiştir: ${count}`);
        if (count > 0) {
          await dispatch('next_episode');
        } else {
          await dispatch('prev_episode');
        }
        return true;
      });
    }

    // 6. Film / Dizi Açma (Kanal Değiştirme ile: "Salon TV'de ... aç" veya "kanalı ... yap")
    if (typeof myTV.onChangeChannel === 'function') {
      myTV.onChangeChannel(async (devId, channel) => {
        let channelName = '';
        if (typeof channel === 'string') {
          channelName = channel;
        } else if (channel && typeof channel === 'object') {
          channelName = channel.name || channel.channelName || '';
        }
        console.log(`[SinricPro] Kanal / Film Açma Talebi: "${channelName}"`);
        if (channelName && channelName.trim()) {
          await dispatch('open', { query: channelName.trim() });
        }
        return true;
      });
    }

    // 7. Giriş Seçimi ile Film Açma (Örn: "Salon TV girişini ... yap")
    if (typeof myTV.onSelectInput === 'function') {
      myTV.onSelectInput(async (devId, input) => {
        console.log(`[SinricPro] Giriş / Film Talebi: "${input}"`);
        if (input && typeof input === 'string' && input.trim()) {
          await dispatch('open', { query: input.trim() });
        }
        return true;
      });
    }

    // 8. The Mentalist Özel Dizi Başlatıcı Anahtarı
    const mentalistId = config.mentalistDeviceId || '6a9d7604b3889c3a11a9b368';
    if (mentalistId) {
      const mentalistSwitch = new SinricProSwitch(mentalistId);
      mentalistSwitch.onPowerState(async (devId, state) => {
        console.log(`[SinricPro] The Mentalist Açma İsteği Alındı! (state: ${state})`);
        if (state) {
          const targetUrl = 'https://www.hdfilmcehennemi.nl/dizi/the-mentalist-izle-7/';
          const watchPath = `/watch?url=${encodeURIComponent(targetUrl)}&title=${encodeURIComponent('The Mentalist')}`;
          await dispatch('navigate', {
            url: watchPath,
            title: 'The Mentalist'
          });
        }
        return true;
      });
      sinricInstance.add(mentalistSwitch);
      console.log(`[SinricService] The Mentalist anahtar cihazı eklendi: ${mentalistId}`);
    }

    // SinricPro'ya cihazı ekle ve başlat
    sinricInstance.add(myTV);
    await sinricInstance.begin({
      appKey: config.appKey,
      appSecret: config.appSecret
    });

    isInitialized = true;
    console.log(`[SinricService] ✓ Sinric Pro Google Home köprüsü başarıyla bağlandı! Hedef: ${targetTvId}`);
    return true;
  } catch (err) {
    console.error('[SinricService] Başlatma hatası:', err.message);
    return false;
  }
}
