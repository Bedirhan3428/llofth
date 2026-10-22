'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  SkipForward,
  SkipBack,
  Maximize,
  Volume2,
  VolumeX,
  Volume1,
  Tv,
  Radio,
  Search,
  Send,
  HelpCircle,
  Check,
  Copy,
  ExternalLink,
  Sparkles,
  Smartphone
} from 'lucide-react';

export default function RemotePage() {
  const [deviceId, setDeviceId] = useState('SALON');
  const [availableDevices, setAvailableDevices] = useState([]);
  const [activeTab, setActiveTab] = useState('remote'); // 'remote' | 'guide'
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [textInput, setTextInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(null);
  const [serverHost, setServerHost] = useState('');

  const recognitionRef = useRef(null);
  const statusTimerRef = useRef(null);

  // Tarayıcı hostunu al
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setServerHost(window.location.host);
      try {
        const savedId = localStorage.getItem('llofth_target_device_id');
        if (savedId) setDeviceId(savedId);
      } catch (e) {}
    }
  }, []);

  // Aktif bağlı cihazları çek
  const fetchDevices = useCallback(async () => {
    try {
      const res = await fetch('/api/remote/command?action=list_devices');
      const data = await res.json();
      if (data.success && Array.isArray(data.devices)) {
        setAvailableDevices(data.devices);
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    fetchDevices();
    const interval = setInterval(fetchDevices, 8000);
    return () => clearInterval(interval);
  }, [fetchDevices]);

  // Bildirim mesajı göster
  const showFeedback = useCallback((msg) => {
    setStatusMessage(msg);
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => {
      setStatusMessage('');
    }, 4000);
  }, []);

  // Cihaz değiştirme
  const handleDeviceChange = (newId) => {
    const clean = newId.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    setDeviceId(clean);
    try {
      localStorage.setItem('llofth_target_device_id', clean);
    } catch (e) {}
    showFeedback(`Hedef ekran: "${clean}"`);
  };

  // Komut Gönderici Fonksiyon
  const sendCommand = async (payload) => {
    setLoading(true);
    try {
      const body = {
        deviceId,
        ...payload
      };

      const res = await fetch('/api/remote/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const result = await res.json();

      if (result.success) {
        showFeedback(result.message || 'Komut başarıyla iletildi ✓');
      } else {
        showFeedback(`Hata: ${result.error || 'İşlem başarısız'}`);
      }
    } catch (err) {
      showFeedback('Bağlantı hatası: Sunucuya ulaşılamadı');
    } finally {
      setLoading(false);
    }
  };

  // Web Speech API Sesli Tanıma
  const toggleSpeech = () => {
    if (isListening) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showFeedback('Tarayıcınız sesli tanıma API\'sini desteklemiyor. Metin kutusunu kullanabilirsiniz.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'tr-TR';
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
        setTranscript('Dinleniyor... (Örn: "Durdur", "Avatar aç")');
      };

      recognition.onresult = (event) => {
        const current = event.resultIndex;
        const text = event.results[current][0].transcript;
        setTranscript(text);

        // Nihai sonuç alındığında doğrudan sunucuya fırlat
        if (event.results[current].isFinal) {
          showFeedback(`İşleniyor: "${text}"`);
          sendCommand({ text });
        }
      };

      recognition.onerror = (event) => {
        console.error('Ses tanıma hatası:', event.error);
        setIsListening(false);
        if (event.error !== 'no-speech') {
          showFeedback(`Mikrofon hatası: ${event.error}`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('Ses başlatma hatası:', err);
      setIsListening(false);
      showFeedback('Mikrofon erişimi başlatılamadı.');
    }
  };

  // Metin Arama / Komut Gönderme
  const handleTextSubmit = (e) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    const commandText = textInput.trim();
    setTextInput('');
    sendCommand({ text: commandText });
  };

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedUrl(key);
    setTimeout(() => setCopiedUrl(null), 2500);
  };

  return (
    <div className="min-h-screen bg-[#0b0c10] text-[#f0f0f5] p-4 md:p-8 max-w-xl mx-auto flex flex-col justify-between">
      {/* BAŞLIK VE HEDEF CİHAZ SEÇİCİ */}
      <div>
        <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
              <Smartphone size={22} />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Gemini Sesli Kumanda</h1>
              <p className="text-xs text-zinc-400">Google Home & Smart TV Köprüsü</p>
            </div>
          </div>

          {/* Sekme Değiştirici */}
          <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 text-xs">
            <button
              onClick={() => setActiveTab('remote')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                activeTab === 'remote' ? 'bg-white/15 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Kumanda
            </button>
            <button
              onClick={() => setActiveTab('guide')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1 ${
                activeTab === 'guide' ? 'bg-white/15 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <HelpCircle size={13} />
              Rehber
            </button>
          </div>
        </div>

        {/* HEDEF EKRAN KARTI */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5 mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <Tv size={18} className="text-zinc-400" />
            <span className="text-xs text-zinc-400">Hedef Cihaz:</span>
            <input
              type="text"
              value={deviceId}
              onChange={(e) => handleDeviceChange(e.target.value)}
              className="bg-black/50 border border-white/15 focus:border-white/40 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-white uppercase w-28 outline-none"
            />
          </div>

          {/* Aktif Cihazlar Butonları */}
          <div className="flex items-center gap-1">
            {['SALON', 'TV-1'].map((preset) => (
              <button
                key={preset}
                onClick={() => handleDeviceChange(preset)}
                className={`text-[11px] px-2 py-1 rounded-md font-mono transition-colors ${
                  deviceId === preset ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-white/5 text-zinc-400 hover:text-white'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {/* BİLDİRİM / GERİ BİLDİRİM ŞERİDİ */}
        {statusMessage && (
          <div className="mb-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 animate-in fade-in duration-150">
            <Sparkles size={14} className="flex-shrink-0" />
            <span className="font-medium">{statusMessage}</span>
          </div>
        )}

        {/* TAB 1: UZAKTAN KUMANDA VE SESLİ ASİSTAN */}
        {activeTab === 'remote' && (
          <div className="space-y-6">
            {/* 1. DEV GEMINI SESLİ ASİSTAN MİKROFON BUTONU */}
            <div className="flex flex-col items-center justify-center p-6 rounded-3xl bg-gradient-to-b from-white/[0.07] to-white/[0.02] border border-white/10 shadow-2xl relative overflow-hidden text-center">
              <div className="absolute inset-0 bg-radial from-cyan-500/10 to-transparent pointer-events-none" />

              <button
                onClick={toggleSpeech}
                disabled={loading}
                className={`relative z-10 w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 shadow-2xl active:scale-95 ${
                  isListening
                    ? 'bg-rose-500 text-white shadow-[0_0_40px_rgba(244,63,94,0.6)] animate-pulse'
                    : 'bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 text-white hover:brightness-110 shadow-[0_0_30px_rgba(6,182,212,0.4)]'
                }`}
              >
                {isListening ? <MicOff size={40} /> : <Mic size={40} />}
              </button>

              <div className="mt-4 z-10">
                <span className="text-xs uppercase font-bold tracking-widest text-cyan-400">
                  {isListening ? 'Sizi Dinliyor...' : 'Gemini Sesli Kontrol'}
                </span>
                <p className="text-xs text-zinc-400 mt-1 max-w-xs">
                  {transcript ? (
                    <span className="text-white font-medium italic">"{transcript}"</span>
                  ) : (
                    'Basıp konuşun: "Durdur", "10 saniye ileri al", "Inception aç"'
                  )}
                </p>
              </div>
            </div>

            {/* 2. HIZLI METİN İLE KOMUT / FİLM ARAMA */}
            <form onSubmit={handleTextSubmit} className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Film adı veya komut yazın (Örn: Avatar aç)..."
                  className="w-full bg-white/5 border border-white/15 focus:border-white/30 rounded-xl px-3.5 py-3 text-xs text-white placeholder-zinc-500 outline-none pr-9"
                />
                <Search size={15} className="absolute right-3 top-3.5 text-zinc-500 pointer-events-none" />
              </div>
              <button
                type="submit"
                disabled={!textInput.trim() || loading}
                className="px-4 py-3 bg-white text-black font-bold rounded-xl text-xs hover:bg-zinc-200 transition-colors disabled:opacity-40 flex items-center gap-1.5 shadow-md"
              >
                <Send size={14} /> Gönder
              </button>
            </form>

            {/* 3. DOKUNMATİK OYNATICI KONTROL TUŞLARI */}
            <div className="bg-white/5 border border-white/10 rounded-3xl p-5 space-y-4">
              {/* Ana Oynat / Durdur / Sarma Çubuğu */}
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={() => sendCommand({ action: 'seek_backward', delta: -15 })}
                  title="15sn Geri"
                  className="w-14 h-14 rounded-2xl bg-white/5 hover:bg-white/15 active:scale-90 border border-white/10 flex flex-col items-center justify-center transition-all"
                >
                  <RotateCcw size={20} />
                  <span className="text-[10px] font-mono mt-0.5">-15s</span>
                </button>

                <button
                  onClick={() => sendCommand({ action: 'toggle_play' })}
                  title="Oynat / Durdur"
                  className="w-20 h-20 rounded-3xl bg-white text-black hover:bg-zinc-200 active:scale-95 flex items-center justify-center shadow-xl transition-all"
                >
                  <Play size={32} className="ml-1 fill-black" />
                </button>

                <button
                  onClick={() => sendCommand({ action: 'seek_forward', delta: 15 })}
                  title="15sn İleri"
                  className="w-14 h-14 rounded-2xl bg-white/5 hover:bg-white/15 active:scale-90 border border-white/10 flex flex-col items-center justify-center transition-all"
                >
                  <RotateCw size={20} />
                  <span className="text-[10px] font-mono mt-0.5">+15s</span>
                </button>
              </div>

              {/* Bölüm Değiştiriciler & Tam Ekran */}
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/10">
                <button
                  onClick={() => sendCommand({ action: 'prev_episode' })}
                  className="py-3 px-2 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 border border-white/5 flex flex-col items-center justify-center gap-1 transition-all text-xs"
                >
                  <SkipBack size={18} />
                  <span className="text-[11px]">Önceki Bölüm</span>
                </button>

                <button
                  onClick={() => sendCommand({ action: 'toggle_fullscreen' })}
                  className="py-3 px-2 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 border border-white/5 flex flex-col items-center justify-center gap-1 transition-all text-xs"
                >
                  <Maximize size={18} />
                  <span className="text-[11px]">Tam Ekran</span>
                </button>

                <button
                  onClick={() => sendCommand({ action: 'next_episode' })}
                  className="py-3 px-2 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 border border-white/5 flex flex-col items-center justify-center gap-1 transition-all text-xs"
                >
                  <SkipForward size={18} />
                  <span className="text-[11px]">Sonraki Bölüm</span>
                </button>
              </div>

              {/* Ses ve Dil Kontrolleri */}
              <div className="grid grid-cols-4 gap-2 pt-2 border-t border-white/10">
                <button
                  onClick={() => sendCommand({ action: 'volume_down' })}
                  className="py-2.5 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 flex items-center justify-center gap-1.5 text-xs"
                >
                  <Volume1 size={16} /> Ses -
                </button>
                <button
                  onClick={() => sendCommand({ action: 'volume_up' })}
                  className="py-2.5 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 flex items-center justify-center gap-1.5 text-xs"
                >
                  <Volume2 size={16} /> Ses +
                </button>
                <button
                  onClick={() => sendCommand({ action: 'mute' })}
                  className="py-2.5 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 flex items-center justify-center gap-1.5 text-xs"
                >
                  <VolumeX size={16} /> Sessiz
                </button>
                <button
                  onClick={() => sendCommand({ action: 'toggle_audio' })}
                  className="py-2.5 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 flex items-center justify-center gap-1.5 text-xs"
                >
                  🌐 Dublaj
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: GOOGLE HOME & GEMINI ENTEGRASYON REHBERİ */}
        {activeTab === 'guide' && (
          <div className="space-y-5 text-xs text-zinc-300">
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Radio size={16} className="text-cyan-400" />
                Google Home & Rutinlerle Sesli Kontrol Kurulumu
              </h2>
              <p>
                Telefonunuzdaki Google Asistan veya Gemini'a <b>"Ok Google, salon durdur"</b> veya <b>"Ok Google, salonda Matrix aç"</b> dediğinizde TV'yi tetiklemek için aşağıdaki Webhook bağlantılarını kullanabilirsiniz.
              </p>
            </div>

            {/* Hazır Webhook Bağlantıları */}
            <div className="space-y-3">
              <h3 className="font-semibold text-white uppercase tracking-wider text-[11px]">
                Hazır Webhook URL Şablonları (GET / POST)
              </h3>

              {[
                { title: 'Oynat / Başlat', action: 'play', url: `http://${serverHost}/api/remote/command?deviceId=${deviceId}&action=play` },
                { title: 'Durdur / Duraklat', action: 'pause', url: `http://${serverHost}/api/remote/command?deviceId=${deviceId}&action=pause` },
                { title: 'Sonraki Bölüm', action: 'next_episode', url: `http://${serverHost}/api/remote/command?deviceId=${deviceId}&action=next_episode` },
                { title: 'Tam Ekran', action: 'fullscreen', url: `http://${serverHost}/api/remote/command?deviceId=${deviceId}&action=fullscreen` },
                { title: '15sn İleri Sar', action: 'seek_forward', url: `http://${serverHost}/api/remote/command?deviceId=${deviceId}&action=seek_forward&delta=15` },
                { title: 'Film Açma (Genel Ses Metni)', action: 'voice', url: `http://${serverHost}/api/remote/command?deviceId=${deviceId}&text=Avatar+filmini+ac` }
              ].map((item) => (
                <div key={item.action} className="p-3 rounded-xl bg-black/40 border border-white/10 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="block font-semibold text-white text-[11px] mb-0.5">{item.title}</span>
                    <code className="block text-[10px] text-zinc-400 truncate font-mono">{item.url}</code>
                  </div>
                  <button
                    onClick={() => copyToClipboard(item.url, item.action)}
                    className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors flex-shrink-0"
                    title="URL'yi Kopyala"
                  >
                    {copiedUrl === item.action ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  </button>
                </div>
              ))}
            </div>

            {/* Google Home / Assistant Kurulum Adımları */}
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
              <h3 className="font-semibold text-white">Nasıl Yapılır?</h3>
              <ol className="list-decimal list-inside space-y-1.5 text-zinc-400">
                <li>Google Home uygulamasında <b>Otomasyonlar (Automations)</b> sekmesine gidin.</li>
                <li>Yeni bir Rutin ekleyin. Başlatıcı olarak <b>"Sesle"</b> seçip <i>"Salon durdur"</i> yazın.</li>
                <li>Eylem olarak <b>Webhook (HTTP İsteği)</b> ekleyin ve yukarıdaki durdurma URL'sini yapıştırın.</li>
                <li>Kaydettiğinizde telefonunuzdan <i>"Ok Google, salon durdur"</i> dediğiniz anda TV'deki video anında duracaktır!</li>
              </ol>
            </div>
          </div>
        )}
      </div>

      {/* ALT BİLGİ */}
      <div className="pt-6 text-center text-[11px] text-zinc-500">
        llofth Smart TV Gateway • Port 23504
      </div>
    </div>
  );
}
