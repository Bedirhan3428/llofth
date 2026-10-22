import { EventEmitter } from 'events';

/**
 * Global Remote Hub Singleton
 * Smart TV ve Sesli Asistan (Google Home / Gemini) arasındaki
 * oturumları ve SSE bağlantılarını yönetir.
 */

class RemoteHub extends EventEmitter {
  constructor() {
    super();
    // deviceId -> Set of SSE controller objects
    this.clients = new Map();
    // deviceId -> { id, lastSeen, currentUrl, mediaTitle, isPlaying, userAgent }
    this.devices = new Map();

    // 45 saniyede bir inaktif cihazları temizle
    if (typeof setInterval !== 'undefined') {
      const cleanInterval = setInterval(() => {
        const now = Date.now();
        for (const [id, dev] of this.devices.entries()) {
          const clientSet = this.clients.get(id);
          const hasActiveClients = clientSet && clientSet.size > 0;
          if (!hasActiveClients && now - dev.lastSeen > 2 * 60 * 1000) {
            this.devices.delete(id);
            this.clients.delete(id);
          }
        }
      }, 45000);
      if (cleanInterval.unref) cleanInterval.unref();
    }
  }

  /**
   * Normalleştirilmiş cihaz ID'si döner
   */
  normalizeDeviceId(id) {
    if (!id || typeof id !== 'string') return 'SALON';
    return id.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '') || 'SALON';
  }

  /**
   * SSE İstemcisi kaydeder
   */
  registerClient(rawDeviceId, controller, meta = {}) {
    const deviceId = this.normalizeDeviceId(rawDeviceId);
    if (!this.clients.has(deviceId)) {
      this.clients.set(deviceId, new Set());
    }
    this.clients.get(deviceId).add(controller);

    this.devices.set(deviceId, {
      id: deviceId,
      lastSeen: Date.now(),
      userAgent: meta.userAgent || '',
      ip: meta.ip || '',
      currentUrl: meta.currentUrl || '',
      mediaTitle: meta.mediaTitle || '',
      isPlaying: false
    });

    console.log(`[RemoteHub] Cihaz bağlandı: "${deviceId}" (Aktif bağlantı: ${this.clients.get(deviceId).size})`);
    return deviceId;
  }

  /**
   * SSE İstemcisi ayrıldığında siler
   */
  unregisterClient(rawDeviceId, controller) {
    const deviceId = this.normalizeDeviceId(rawDeviceId);
    const clientSet = this.clients.get(deviceId);
    if (clientSet) {
      clientSet.delete(controller);
      if (clientSet.size === 0) {
        console.log(`[RemoteHub] Cihazın son bağlantısı koptu: "${deviceId}"`);
      }
    }
  }

  /**
   * Cihazın durumunu günceller (oynatma durumu, başlık vb.)
   */
  updateDeviceState(rawDeviceId, state = {}) {
    const deviceId = this.normalizeDeviceId(rawDeviceId);
    const existing = this.devices.get(deviceId) || { id: deviceId };
    this.devices.set(deviceId, {
      ...existing,
      ...state,
      lastSeen: Date.now()
    });
  }

  /**
   * Belirli bir cihaza veya tüm cihazlara komut gönderir
   */
  sendCommand(rawDeviceId, action, payload = {}) {
    let targetId = rawDeviceId ? this.normalizeDeviceId(rawDeviceId) : null;

    // Eğer deviceId belirtilmemişse veya 'auto' ise, tek bir bağlı cihaz varsa onu seç
    if (!targetId || targetId === 'AUTO' || targetId === 'DEFAULT') {
      const activeDevices = this.getActiveDevices();
      if (activeDevices.length === 1) {
        targetId = activeDevices[0].id;
      } else if (activeDevices.length > 1) {
        // Öncelik 'SALON' ID'sinde
        const salonDev = activeDevices.find(d => d.id === 'SALON');
        targetId = salonDev ? salonDev.id : activeDevices[0].id;
      } else {
        targetId = 'SALON'; // Varsayılan hedef
      }
    }

    const commandData = {
      action,
      payload,
      targetDevice: targetId,
      timestamp: Date.now()
    };

    const sseMessage = `data: ${JSON.stringify(commandData)}\n\n`;
    let deliveredCount = 0;

    if (targetId === 'ALL') {
      for (const [id, set] of this.clients.entries()) {
        for (const controller of set) {
          try {
            controller.enqueue(new TextEncoder().encode(sseMessage));
            deliveredCount++;
          } catch (err) {
            console.error(`[RemoteHub] SSE yazma hatası (${id}):`, err.message);
          }
        }
      }
    } else {
      const clientSet = this.clients.get(targetId);
      if (clientSet && clientSet.size > 0) {
        for (const controller of clientSet) {
          try {
            controller.enqueue(new TextEncoder().encode(sseMessage));
            deliveredCount++;
          } catch (err) {
            console.error(`[RemoteHub] SSE yazma hatası (${targetId}):`, err.message);
          }
        }
      }
    }

    console.log(`[RemoteHub] Komut gönderildi: ${action} -> Hedef: ${targetId} (İletilen ekran sayısı: ${deliveredCount})`);
    return {
      success: deliveredCount > 0,
      targetDevice: targetId,
      deliveredCount,
      action,
      payload
    };
  }

  /**
   * Aktif bağlı cihaz listesini döner
   */
  getActiveDevices() {
    const list = [];
    for (const [id, set] of this.clients.entries()) {
      if (set && set.size > 0) {
        const info = this.devices.get(id) || { id };
        list.push({
          id,
          connections: set.size,
          lastSeen: info.lastSeen || Date.now(),
          currentUrl: info.currentUrl || '',
          mediaTitle: info.mediaTitle || '',
          isPlaying: !!info.isPlaying
        });
      }
    }
    return list;
  }
}

// Next.js Hot Reloading & Singleton garantisi
if (!globalThis.__remoteHub) {
  globalThis.__remoteHub = new RemoteHub();
}

export const remoteHub = globalThis.__remoteHub;
export default remoteHub;
