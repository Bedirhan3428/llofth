'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Tv, Wifi, Check, Settings, X, ExternalLink, Radio } from 'lucide-react';

export default function RemoteListener() {
  const router = useRouter();
  const pathname = usePathname();

  const [deviceId, setDeviceId] = useState('SALON');
  const [isConnected, setIsConnected] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [tempIdInput, setTempIdInput] = useState('SALON');
  const [toastMessage, setToastMessage] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const eventSourceRef = useRef(null);
  const toastTimerRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  // Ekranda sesli asistan bildirimi göster
  const showToast = useCallback((text) => {
    setToastMessage(text);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  }, []);

  // Cihaz Kimliğini LocalStorage'dan yükle
  useEffect(() => {
    try {
      const saved = localStorage.getItem('llofth_device_id');
      if (saved) {
        setDeviceId(saved);
        setTempIdInput(saved);
      } else {
        localStorage.setItem('llofth_device_id', 'SALON');
      }
    } catch (e) {}
  }, []);

  // Tam ekran durumunu takip et (video izlerken gereksiz butonları gizlemek için)
  useEffect(() => {
    const checkFs = () => {
      setIsFullscreen(!!(document.fullscreenElement || document.webkitFullscreenElement));
    };
    document.addEventListener('fullscreenchange', checkFs);
    document.addEventListener('webkitfullscreenchange', checkFs);
    return () => {
      document.removeEventListener('fullscreenchange', checkFs);
      document.removeEventListener('webkitfullscreenchange', checkFs);
    };
  }, []);

  // SSE Bağlantısını Kur ve Canlı Olayları Dinle
  useEffect(() => {
    if (!deviceId) return;

    let isUnmounted = false;

    const connectSSE = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const url = `/api/remote/events?deviceId=${encodeURIComponent(deviceId)}&url=${encodeURIComponent(pathname || '')}`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onopen = () => {
        if (!isUnmounted) {
          setIsConnected(true);
          console.log(`[RemoteListener] ${deviceId} için canlı kumanda köprüsü bağlandı.`);
        }
      };

      es.onmessage = (event) => {
        try {
          if (!event.data || event.data.trim() === ': ping') return;
          const data = JSON.parse(event.data);

          if (data.action === 'connected') {
            setIsConnected(true);
            return;
          }

          console.log('[RemoteListener] Gelen Komut:', data);

          // 1. Yeni İçerik veya URL Yönlendirmesi
          if (data.action === 'navigate' && data.payload?.url) {
            const mediaTitle = data.payload.title || 'İçerik';
            showToast(`📺 Sesli Asistan: "${mediaTitle}" açılıyor...`);
            setTimeout(() => {
              router.push(data.payload.url);
            }, 600);
            return;
          }

          // 2. Sayfa Yenileme
          if (data.action === 'reload') {
            showToast('📺 Ekran yenileniyor...');
            setTimeout(() => window.location.reload(), 500);
            return;
          }

          // 3. Oynatıcı Komutları (CustomPlayer'a ilet)
          window.dispatchEvent(new CustomEvent('remote-player-command', { detail: data }));

          // Bildirim metinleri
          const friendlyTitles = {
            play: 'Oynatılıyor ▶',
            pause: 'Duraklatıldı ⏸',
            toggle_play: 'Oynat / Durdur',
            seek: `${data.payload?.delta > 0 ? '+' : ''}${data.payload?.delta || 15} sn`,
            seek_forward: '+15 sn İleri ⏩',
            seek_backward: '-15 sn Geri ⏪',
            next_episode: 'Sonraki Bölüm ⏭',
            prev_episode: 'Önceki Bölüm ⏮',
            fullscreen: 'Tam Ekran ⛶',
            exit_fullscreen: 'Tam Ekrandan Çıkıldı',
            volume_up: 'Ses Açıldı 🔊',
            volume_down: 'Ses Kısıldı 🔉',
            mute: 'Sessize Alındı 🔇',
            toggle_audio: 'Ses Dili Değiştirildi 🌐',
            toggle_subtitle: 'Altyazı Değiştirildi 💬'
          };

          if (friendlyTitles[data.action]) {
            showToast(`🎙️ Sesli Komut: ${friendlyTitles[data.action]}`);
          }
        } catch (e) {
          console.error('[RemoteListener] Mesaj işleme hatası:', e);
        }
      };

      es.onerror = () => {
        if (!isUnmounted) {
          setIsConnected(false);
          es.close();
          // 4 saniye sonra tekrar bağlanmayı dene
          if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = setTimeout(connectSSE, 4000);
        }
      };
    };

    connectSSE();

    return () => {
      isUnmounted = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [deviceId, pathname, router, showToast]);

  // Cihaz Kimliğini Güncelle
  const handleSaveId = (e) => {
    e.preventDefault();
    const cleanId = (tempIdInput || 'SALON').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    setDeviceId(cleanId);
    try {
      localStorage.setItem('llofth_device_id', cleanId);
    } catch (err) {}
    setShowConfigModal(false);
    showToast(`📺 TV Cihaz Kimliği: "${cleanId}" olarak ayarlandı.`);
  };

  return (
    <>
      {/* 1. SESLİ ASİSTAN EKRAN BİLDİRİMİ (TOAST) */}
      {toastMessage && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="bg-[#12131d]/95 backdrop-blur-xl border border-white/20 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 text-sm md:text-base font-semibold tracking-wide">
            <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* 2. KÜÇÜK VE ŞIK CİHAZ ID ROZETİ (TV Modu / Masaüstü Sağ Üst Köşe) */}
      {!isFullscreen && (
        <div className="fixed top-4 right-4 z-30 flex items-center gap-2">
          <button
            onClick={() => setShowConfigModal(true)}
            title="TV Oturum ve Sesli Asistan Bağlantısı"
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/40 hover:bg-black/70 backdrop-blur-md border border-white/10 hover:border-white/25 text-xs text-zinc-300 transition-all cursor-pointer shadow-lg outline-none group"
          >
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-amber-400'}`} />
            <Tv size={14} className="text-zinc-400 group-hover:text-white transition-colors" />
            <span className="font-mono font-medium tracking-wider text-white">{deviceId}</span>
          </button>
        </div>
      )}

      {/* 3. CİHAZ ID & SESLİ ASİSTAN AYARLARI MODALI */}
      {showConfigModal && (
        <div className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#13141f] border border-white/15 rounded-2xl w-full max-w-md p-6 shadow-2xl relative text-white">
            <button
              onClick={() => setShowConfigModal(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-white/10"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Radio size={20} />
              </div>
              <div>
                <h3 className="font-bold text-lg">Sesli Asistan & Cihaz Oturumu</h3>
                <p className="text-xs text-zinc-400">Google Home ve Gemini ile bu ekranı kontrol edin</p>
              </div>
            </div>

            <form onSubmit={handleSaveId} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5 uppercase tracking-wider">
                  Ekran / TV Cihaz Kimliği (Device ID)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tempIdInput}
                    onChange={(e) => setTempIdInput(e.target.value)}
                    placeholder="Örn: SALON, TV-1, YATAK_ODASI"
                    className="flex-1 bg-black/40 border border-white/15 focus:border-white/40 rounded-xl px-3.5 py-2.5 text-sm font-mono text-white outline-none"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2.5 bg-white text-black font-semibold rounded-xl text-xs hover:bg-zinc-200 transition-colors flex items-center gap-1.5"
                  >
                    <Check size={16} /> Kaydet
                  </button>
                </div>
                <p className="text-[11px] text-zinc-400 mt-1.5">
                  Sesli komut verirken bu ismi kullanabilirsiniz. Örn: <i>"Salonda Inception aç"</i> veya <i>"Salon durdur"</i>.
                </p>
              </div>

              {/* Hızlı Seçim Butonları */}
              <div className="flex flex-wrap gap-2 pt-1">
                {['SALON', 'TV-1', 'YATAK_ODASI', 'OTURMA_ODASI'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setTempIdInput(preset)}
                    className={`text-[11px] px-2.5 py-1 rounded-lg border font-mono transition-colors ${
                      tempIdInput === preset
                        ? 'border-emerald-400 bg-emerald-400/10 text-emerald-300'
                        : 'border-white/10 text-zinc-400 hover:text-white hover:border-white/20'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>

              {/* Bağlantı Durumu */}
              <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between text-xs">
                <span className="text-zinc-400">Canlı Bağlantı Durumu:</span>
                <span className="flex items-center gap-1.5 font-medium text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  {isConnected ? 'Bağlı (Komut Bekleniyor)' : 'Bağlanıyor...'}
                </span>
              </div>

              {/* Mobil Kumanda Bağlantı Butonu */}
              <div className="pt-2">
                <a
                  href={`/remote?device=${encodeURIComponent(deviceId)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-xs font-semibold text-white transition-colors"
                >
                  <ExternalLink size={15} />
                  Telefondan Sesli Kumandayı Aç (/remote)
                </a>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
