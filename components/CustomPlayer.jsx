'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Radio,
  Sliders,
  Check,
  X,
  Tv
} from 'lucide-react';

export default function CustomPlayer({
  streamUrl,
  title,
  initialTime = 0,
  onProgressUpdate,
  onNextEpisode,
  onPrevEpisode,
  hasNext,
  hasPrev
}) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const containerRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [actionNotification, setActionNotification] = useState(null);
  const [showRemoteHelp, setShowRemoteHelp] = useState(false);

  // Menüler
  const [audioTracks, setAudioTracks] = useState([]);
  const [selectedAudio, setSelectedAudio] = useState(-1);
  const [qualities, setQualities] = useState([]);
  const [selectedQuality, setSelectedQuality] = useState(-1);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState('main'); // 'main' | 'audio' | 'quality'

  const [showControls, setShowControls] = useState(true);
  const controlsTimerRef = useRef(null);
  const notificationTimerRef = useRef(null);
  const initialSeekDoneRef = useRef(false);

  const showToast = useCallback((msg) => {
    setActionNotification(msg);
    if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current);
    notificationTimerRef.current = setTimeout(() => {
      setActionNotification(null);
    }, 2500);
  }, []);

  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => {
      if (!showSettingsMenu && !showRemoteHelp) {
        setShowControls(false);
      }
    }, 3500);
  }, [showSettingsMenu, showRemoteHelp]);

  // Hls.js başlatma & Kaldığı Yerden Devam Etme
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;

    initialSeekDoneRef.current = false;

    let finalUrl = streamUrl;
    if (!finalUrl.startsWith('/api/proxy') && !finalUrl.startsWith('/playlist')) {
      finalUrl = `/api/proxy/playlist?url=${encodeURIComponent(finalUrl)}`;
    }

    const applyInitialSeek = () => {
      if (!initialSeekDoneRef.current && initialTime > 5) {
        video.currentTime = initialTime;
        initialSeekDoneRef.current = true;
        showToast(`Kaldığınız yerden devam ediliyor (${formatTime(initialTime)})`);
      }
    };

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
        maxBufferLength: 30,
        maxMaxBufferLength: 600,
        maxBufferSize: 60 * 1000 * 1000,
        autoStartLoad: true
      });

      hlsRef.current = hls;
      hls.loadSource(finalUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        applyInitialSeek();
        video.play().catch(e => console.log('Oynatma bekleniyor:', e));
        setIsPlaying(true);

        if (hls.levels && hls.levels.length > 0) {
          setQualities(hls.levels);
        }

        if (hls.audioTracks && hls.audioTracks.length > 0) {
          setAudioTracks(hls.audioTracks);
          setSelectedAudio(hls.audioTrack);
        }
      });

      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (event, data) => {
        setSelectedAudio(data.id);
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              break;
          }
        }
      });

      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = finalUrl;
      video.addEventListener('loadedmetadata', applyInitialSeek);
      video.play().catch(e => console.log('Native oynatma:', e));
    }
  }, [streamUrl, initialTime, showToast]);

  // Zaman & Buffer & İlerleme Kaydetme
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let lastSavedTime = 0;

    const handleTimeUpdate = () => {
      const cur = video.currentTime;
      const dur = video.duration || 0;
      setCurrentTime(cur);
      setDuration(dur);

      if (video.buffered.length > 0) {
        for (let i = video.buffered.length - 1; i >= 0; i--) {
          if (video.buffered.start(i) <= cur) {
            setBuffered(video.buffered.end(i));
            break;
          }
        }
      }

      // Her 3 saniyede bir ilerlemeyi kaydet
      if (Math.abs(cur - lastSavedTime) > 3 && onProgressUpdate) {
        lastSavedTime = cur;
        onProgressUpdate({ currentTime: cur, duration: dur });
      }
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => {
      setIsPlaying(false);
      if (onProgressUpdate && video.duration) {
        onProgressUpdate({ currentTime: video.currentTime, duration: video.duration });
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, [onProgressUpdate]);

  // Native Fullscreen & Otomatik Yatay (Landscape) Döndürme Dinleyicisi
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFull = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);
      setIsFullscreen(isFull);

      if (!isFull) {
        // Tam ekrandan çıkıldığında ekran yönü kilidini aç
        try {
          if (screen.orientation && screen.orientation.unlock) {
            screen.orientation.unlock();
          } else if (screen.unlockOrientation) {
            screen.unlockOrientation();
          }
        } catch (e) {}
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
    };
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  }, []);

  const seek = useCallback((seconds) => {
    const video = videoRef.current;
    if (!video) return;
    const nextTime = Math.max(0, Math.min(video.duration || Infinity, video.currentTime + seconds));
    video.currentTime = nextTime;
    showToast(`${seconds > 0 ? `+${seconds}sn İleri` : `${seconds}sn Geri`} (${formatTime(nextTime)})`);
  }, [showToast]);

  const toggleNativeFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;

    if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.mozFullScreenElement) {
      try {
        if (el.requestFullscreen) {
          await el.requestFullscreen();
        } else if (el.webkitRequestFullscreen) {
          await el.webkitRequestFullscreen();
        } else if (el.mozRequestFullScreen) {
          await el.mozRequestFullScreen();
        } else if (el.msRequestFullscreen) {
          await el.msRequestFullscreen();
        }
      } catch (err) {
        console.log('Fullscreen error:', err);
      }

      setIsFullscreen(true);
      showToast('⛶ Tam Ekran (Yatay)');

      // Mobilde otomatik olarak ekranı yatay moda (landscape) çevir
      try {
        if (screen.orientation && screen.orientation.lock) {
          await screen.orientation.lock('landscape');
        } else if (screen.lockOrientation) {
          screen.lockOrientation('landscape');
        } else if (screen.mozLockOrientation) {
          screen.mozLockOrientation('landscape');
        } else if (screen.msLockOrientation) {
          screen.msLockOrientation('landscape');
        }
      } catch (e) {
        // Bazı tarayıcılar yön kilitlemeye izin vermezse sessizce devam et
      }
    } else {
      try {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          await document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
          await document.mozCancelFullScreen();
        }
      } catch (err) {
        console.log('Exit fullscreen error:', err);
      }

      setIsFullscreen(false);
      showToast('Pencere Modu');

      try {
        if (screen.orientation && screen.orientation.unlock) {
          screen.orientation.unlock();
        } else if (screen.unlockOrientation) {
          screen.unlockOrientation();
        }
      } catch (e) {}
    }
  }, [showToast]);

  const toggleAudioTrack = useCallback(() => {
    if (!hlsRef.current || audioTracks.length < 2) {
      showToast('Tek ses kanalı mevcut');
      return;
    }
    const nextTrack = (selectedAudio + 1) % audioTracks.length;
    setSelectedAudio(nextTrack);
    hlsRef.current.audioTrack = nextTrack;
    const trackName = audioTracks[nextTrack]?.name || audioTracks[nextTrack]?.lang || `Kanal ${nextTrack + 1}`;
    showToast(`🔊 Ses Dili: ${trackName}`);
  }, [audioTracks, selectedAudio, showToast]);

  // SMART TV KUMANDA NUMARATİK KISAYOLLARI (0-9) & KLAVYE DİNLEYİCİSİ
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Eğer kullanıcı arama çubuğuna yazı yazıyorsa kısayolları çalıştırma
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
        return;
      }

      showControlsTemporarily();
      const video = videoRef.current;
      if (!video) return;

      const key = e.key;

      // --- 1. SMART TV KUMANDASI NUMARA TUŞLARI (0, 1, 2, 3, 4, 5, 6, 7, 8, 9) ---
      if (key === '5') {
        // 5: Oynat / Duraklat (Merkez Tuş)
        e.preventDefault();
        togglePlay();
      } else if (key === '4') {
        // 4: 10sn Geri Sar (Sol)
        e.preventDefault();
        seek(-10);
      } else if (key === '6') {
        // 6: 10sn İleri Sar (Sağ)
        e.preventDefault();
        seek(10);
      } else if (key === '8') {
        // 8: Ses Aç (+10%) (Yukarı)
        e.preventDefault();
        const newVol = Math.min(1, Math.round((video.volume + 0.1) * 10) / 10);
        video.volume = newVol;
        setVolume(newVol);
        setIsMuted(false);
        showToast(`🔊 Ses: %${Math.round(newVol * 100)}`);
      } else if (key === '2') {
        // 2: Ses Kıs (-10%) (Aşağı)
        e.preventDefault();
        const newVol = Math.max(0, Math.round((video.volume - 0.1) * 10) / 10);
        video.volume = newVol;
        setVolume(newVol);
        showToast(`🔉 Ses: %${Math.round(newVol * 100)}`);
      } else if (key === '0') {
        // 0: Tam Ekran Modu (Fullscreen)
        e.preventDefault();
        toggleNativeFullscreen();
      } else if (key === '7') {
        // 7: Ses Dili Değiştir (Dual Audio: Türkçe ⇄ İngilizce)
        e.preventDefault();
        toggleAudioTrack();
      } else if (key === '9') {
        // 9: Sesi Kapat / Aç (Mute)
        e.preventDefault();
        video.muted = !video.muted;
        setIsMuted(video.muted);
        showToast(video.muted ? '🔇 Ses Kapatıldı' : '🔊 Ses Açıldı');
      } else if (key === '1') {
        // 1: Önceki Bölüm
        e.preventDefault();
        if (hasPrev && onPrevEpisode) {
          showToast('◀ Önceki Bölüme Geçiliyor...');
          onPrevEpisode();
        } else {
          showToast('İlk bölümdesiniz');
        }
      } else if (key === '3') {
        // 3: Sonraki Bölüm
        e.preventDefault();
        if (hasNext && onNextEpisode) {
          showToast('Sonraki Bölüme Geçiliyor ▶');
          onNextEpisode();
        } else {
          showToast('Son bölümdesiniz');
        }
      }

      // --- 2. KLAVYE VE STANDART MEDYA TUŞLARI ---
      else if (key === ' ' || key === 'k' || key === 'MediaPlayPause') {
        e.preventDefault();
        togglePlay();
      } else if (key === 'ArrowRight' || key === 'MediaFastForward') {
        e.preventDefault();
        seek(10);
      } else if (key === 'ArrowLeft' || key === 'MediaRewind') {
        e.preventDefault();
        seek(-10);
      } else if (key === 'ArrowUp') {
        e.preventDefault();
        const newVol = Math.min(1, Math.round((video.volume + 0.1) * 10) / 10);
        video.volume = newVol;
        setVolume(newVol);
        setIsMuted(false);
        showToast(`🔊 Ses: %${Math.round(newVol * 100)}`);
      } else if (key === 'ArrowDown') {
        e.preventDefault();
        const newVol = Math.max(0, Math.round((video.volume - 0.1) * 10) / 10);
        video.volume = newVol;
        setVolume(newVol);
        showToast(`🔉 Ses: %${Math.round(newVol * 100)}`);
      } else if (key === 'm' || key === 'M') {
        video.muted = !video.muted;
        setIsMuted(video.muted);
        showToast(video.muted ? '🔇 Ses Kapatıldı' : '🔊 Ses Açıldı');
      } else if (key === 'f' || key === 'F') {
        e.preventDefault();
        toggleNativeFullscreen();
      } else if (key === 'n' || key === 'N' || key === 'MediaTrackNext') {
        if (hasNext && onNextEpisode) onNextEpisode();
      } else if (key === 'p' || key === 'P' || key === 'MediaTrackPrevious') {
        if (hasPrev && onPrevEpisode) onPrevEpisode();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showControlsTemporarily, togglePlay, seek, toggleNativeFullscreen, toggleAudioTrack, hasNext, hasPrev, onNextEpisode, onPrevEpisode, showToast]);

  const handleScrub = (e) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    video.currentTime = Math.max(0, Math.min(duration, pos * duration));
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
    showToast(video.muted ? '🔇 Ses Kapatıldı' : '🔊 Ses Açıldı');
  };

  const handleVolumeChange = (e) => {
    const video = videoRef.current;
    if (!video) return;
    const val = parseFloat(e.target.value);
    video.volume = val;
    setVolume(val);
    setIsMuted(val === 0);
  };

  const changeAudioTrack = (trackId) => {
    setSelectedAudio(trackId);
    if (hlsRef.current && trackId !== -1) {
      hlsRef.current.audioTrack = trackId;
    }
    const name = audioTracks[trackId]?.name || audioTracks[trackId]?.lang || `Kanal ${trackId + 1}`;
    showToast(`🔊 Ses Dili: ${name}`);
    setShowSettingsMenu(false);
  };

  const changeQuality = (levelId) => {
    setSelectedQuality(levelId);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelId;
    }
    const label = levelId === -1 ? 'Otomatik' : `${qualities[levelId]?.height}p`;
    showToast(`⚙️ Kalite: ${label}`);
    setShowSettingsMenu(false);
  };

  const formatTime = (secs) => {
    if (isNaN(secs) || secs < 0) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? (buffered / duration) * 100 : 0;

  // Ekrana Tek Tıklama: Sadece Kontrolleri Aç/Kapa Yapar (Videoyu Durdurmaz)
  const handleScreenClick = (e) => {
    // Eğer tıklanan eleman bir buton veya girdi ise bu işlemi yapma
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) {
      return;
    }

    setShowControls((prev) => {
      const nextState = !prev;
      if (nextState) {
        // Kontroller açıldıysa otomatik gizleme zamanlayıcısını başlat
        if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
        controlsTimerRef.current = setTimeout(() => {
          if (!showSettingsMenu && !showRemoteHelp && isPlaying) {
            setShowControls(false);
          }
        }, 3500);
      }
      return nextState;
    });
  };

  // Ekrana Çift Tıklama: Oynat / Durdur Yapar
  const handleScreenDoubleClick = (e) => {
    if (e.target.closest('button') || e.target.closest('input')) {
      return;
    }
    togglePlay();
  };

  return (
    <div
      ref={containerRef}
      onClick={handleScreenClick}
      onDoubleClick={handleScreenDoubleClick}
      onMouseMove={showControlsTemporarily}
      className={`relative w-full aspect-video bg-black overflow-hidden select-none font-sans cursor-pointer ${
        isFullscreen
          ? 'fixed inset-0 w-screen h-screen z-[99999] rounded-none border-0'
          : 'rounded-none sm:rounded-2xl border-0 sm:border border-white/10 shadow-2xl'
      }`}
    >
      {/* Video Element (Tek tıkla durdurma kaldırıldı) */}
      <video
        ref={videoRef}
        playsInline
        className="w-full h-full object-contain bg-black pointer-events-none"
      />

      {/* SMART TV ANLIK BİLDİRİM / GERİ BİLDİRİM TOAST ROZETİ */}
      {actionNotification && (
        <div className="absolute top-3 left-3 sm:top-4 sm:left-4 z-40 px-3 py-1.5 rounded-lg bg-black/90 backdrop-blur-md border border-white/20 text-white text-xs font-semibold flex items-center gap-2 shadow-2xl animate-in fade-in duration-200">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>{actionNotification}</span>
        </div>
      )}

      {/* MOBİL VE DOKUNMATİK İÇİN ORTA EKRAN OYNAT/DURDUR/SARMA DÜĞMELERİ */}
      <div
        className={`absolute inset-0 flex items-center justify-center gap-6 sm:gap-10 transition-opacity duration-200 pointer-events-none ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <button
          onClick={(e) => { e.stopPropagation(); seek(-10); }}
          className="p-2 sm:p-3 rounded-full bg-black/60 hover:bg-black/80 text-white/80 hover:text-white backdrop-blur-sm pointer-events-auto transition-transform active:scale-90 outline-none"
          title="[4] 10sn Geri"
        >
          <RotateCcw size={20} className="sm:w-6 sm:h-6" />
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); togglePlay(); }}
          className="p-3.5 sm:p-5 rounded-full bg-white text-black hover:bg-zinc-200 backdrop-blur-sm pointer-events-auto transition-transform active:scale-90 shadow-2xl outline-none"
          title={isPlaying ? '[5] Durdur' : '[5] Oynat'}
        >
          {isPlaying ? <Pause size={24} className="sm:w-7 sm:h-7" /> : <Play size={24} className="sm:w-7 sm:h-7 ml-0.5" />}
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); seek(10); }}
          className="p-2 sm:p-3 rounded-full bg-black/60 hover:bg-black/80 text-white/80 hover:text-white backdrop-blur-sm pointer-events-auto transition-transform active:scale-90 outline-none"
          title="[6] 10sn İleri"
        >
          <RotateCw size={20} className="sm:w-6 sm:h-6" />
        </button>
      </div>

      {/* SMART TV KUMANDA REHBERİ POPUP PENCERESİ */}
      {showRemoteHelp && (
        <div className="absolute inset-0 bg-black/85 backdrop-blur-md z-50 p-4 sm:p-6 flex flex-col justify-center items-center text-white text-center animate-in fade-in">
          <div className="flex items-center justify-between w-full max-w-sm mb-3">
            <h3 className="text-sm sm:text-base font-bold flex items-center gap-1.5">
              <Tv size={18} /> Smart TV Kumanda Numaraları
            </h3>
            <button onClick={() => setShowRemoteHelp(false)} className="p-1 text-zinc-400 hover:text-white">
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 w-full max-w-sm text-xs font-medium">
            <div className="p-2 rounded bg-white/10 border border-white/10"><b className="text-emerald-400 text-sm">1</b><br/>Önceki Bölüm</div>
            <div className="p-2 rounded bg-white/10 border border-white/10"><b className="text-emerald-400 text-sm">2</b><br/>Ses Kıs (-10)</div>
            <div className="p-2 rounded bg-white/10 border border-white/10"><b className="text-emerald-400 text-sm">3</b><br/>Sonraki Bölüm</div>
            
            <div className="p-2 rounded bg-white/10 border border-white/10"><b className="text-emerald-400 text-sm">4</b><br/>10sn Geri</div>
            <div className="p-2 rounded bg-white/20 border border-white/20"><b className="text-emerald-400 text-sm">5</b><br/>Oynat / Durdur</div>
            <div className="p-2 rounded bg-white/10 border border-white/10"><b className="text-emerald-400 text-sm">6</b><br/>10sn İleri</div>

            <div className="p-2 rounded bg-white/10 border border-white/10"><b className="text-emerald-400 text-sm">7</b><br/>Ses Dili (TR/EN)</div>
            <div className="p-2 rounded bg-white/10 border border-white/10"><b className="text-emerald-400 text-sm">8</b><br/>Ses Aç (+10)</div>
            <div className="p-2 rounded bg-white/10 border border-white/10"><b className="text-emerald-400 text-sm">9</b><br/>Sessiz (Mute)</div>
            
            <div className="col-span-3 p-2 rounded bg-white/10 border border-white/10">
              <b className="text-emerald-400 text-sm">0</b> : Tam Ekran (Fullscreen)
            </div>
          </div>
        </div>
      )}

      {/* Kontroller Katmanı (Üst & Alt Barlar) */}
      <div
        className={`absolute inset-0 flex flex-col justify-between p-3 sm:p-4 md:p-6 bg-gradient-to-t from-black/90 via-transparent to-black/70 transition-opacity duration-200 pointer-events-none ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* ÜST BİLGİ ÇUBUĞU */}
        <div className="flex justify-between items-center pointer-events-auto">
          <span className="text-[11px] sm:text-xs font-semibold text-white/90 truncate max-w-[180px] sm:max-w-md">
            {title}
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowRemoteHelp(!showRemoteHelp)}
              className="flex items-center gap-1 text-[10px] sm:text-[11px] text-zinc-300 bg-white/10 hover:bg-white/20 px-2 py-0.5 rounded border border-white/10 transition-colors"
              title="Kumanda Numaraları Kılavuzu"
            >
              <Tv size={12} />
              <span>Kumanda (0-9)</span>
            </button>
            <span className="text-[10px] sm:text-[11px] font-mono text-zinc-400 bg-black/60 px-2 py-0.5 rounded border border-white/10">
              HLS 1080p
            </span>
          </div>
        </div>

        {/* ALT KONTROL VE İLERLEME ÇUBUĞU */}
        <div className="flex flex-col gap-2 pointer-events-auto">
          {/* İlerleme Çubuğu (Scrubber) */}
          <div
            onClick={handleScrub}
            className="relative w-full h-2 hover:h-3 bg-white/20 rounded-full cursor-pointer transition-all flex items-center"
          >
            <div
              style={{ width: `${bufferedPercent}%` }}
              className="absolute top-0 left-0 h-full bg-white/20 rounded-full pointer-events-none"
            />
            <div
              style={{ width: `${progressPercent}%` }}
              className="absolute top-0 left-0 h-full bg-white rounded-full pointer-events-none"
            />
          </div>

          {/* Alt Kontrol Butonları */}
          <div className="flex justify-between items-center text-white">
            {/* Sol: Süre & Önceki/Sonraki */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Masaüstünde Önceki/Sonraki Butonları */}
              {hasPrev && (
                <button
                  onClick={onPrevEpisode}
                  tabIndex={104}
                  className="hidden md:flex items-center gap-1 px-2.5 py-1 rounded bg-white/5 hover:bg-white/15 text-xs text-zinc-300 hover:text-white transition-colors outline-none"
                  title="[1] Önceki Bölüm"
                >
                  <SkipBack size={13} /> Önceki
                </button>
              )}

              {hasNext && (
                <button
                  onClick={onNextEpisode}
                  tabIndex={105}
                  className="hidden md:flex items-center gap-1 px-2.5 py-1 rounded bg-white/5 hover:bg-white/15 text-xs text-zinc-300 hover:text-white transition-colors outline-none"
                  title="[3] Sonraki Bölüm"
                >
                  Sonraki <SkipForward size={13} />
                </button>
              )}

              {/* Ses Kaydırıcı */}
              <div className="hidden sm:flex items-center gap-1.5 ml-1">
                <button
                  onClick={toggleMute}
                  tabIndex={106}
                  className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white outline-none"
                  title="[9] Sessiz"
                >
                  {isMuted || volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  tabIndex={107}
                  className="w-12 md:w-16 h-1 bg-white/30 rounded accent-white cursor-pointer"
                />
              </div>

              {/* Süre Göstergesi */}
              <div className="text-[11px] sm:text-xs font-mono text-zinc-400 ml-1">
                <span className="text-zinc-200">{formatTime(currentTime)}</span>
                <span className="mx-1 text-zinc-600">/</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Sağ: Ses Dili / Kalite Ayarları & Tam Ekran */}
            <div className="flex items-center gap-1.5 sm:gap-2 relative">
              <button
                onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                tabIndex={108}
                className={`p-1.5 sm:p-2 rounded-lg transition-colors outline-none ${
                  showSettingsMenu ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20 text-zinc-300'
                }`}
                title="Ses Dili & Kalite [7]"
              >
                <Sliders size={15} />
              </button>

              <button
                onClick={toggleNativeFullscreen}
                tabIndex={109}
                className="p-1.5 sm:p-2 rounded-lg bg-white/10 hover:bg-white/20 text-zinc-200 hover:text-white transition-colors outline-none"
                title="[0] Tam Ekran"
              >
                {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
              </button>

              {/* Ayarlar Açılır Menüsü */}
              {showSettingsMenu && (
                <div className="absolute bottom-11 right-0 w-56 sm:w-60 bg-[#14151e] border border-white/20 rounded-xl p-2 shadow-2xl flex flex-col gap-1 z-50 animate-in fade-in zoom-in-95 duration-150">
                  {activeSettingsTab === 'main' && (
                    <>
                      <div className="flex items-center justify-between px-2 py-1 border-b border-white/10 pb-1">
                        <span className="text-[11px] font-semibold text-zinc-400">Seçenekler</span>
                        <button onClick={() => setShowSettingsMenu(false)} className="text-zinc-400 hover:text-white p-0.5">
                          <X size={13} />
                        </button>
                      </div>

                      <button
                        onClick={() => setActiveSettingsTab('audio')}
                        tabIndex={110}
                        className="flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-white/10 text-xs font-medium text-zinc-200 text-left"
                      >
                        <div className="flex items-center gap-2">
                          <Radio size={13} />
                          <span>Ses Dili</span>
                        </div>
                        <span className="text-[11px] text-zinc-400 truncate max-w-[90px]">
                          {audioTracks[selectedAudio]?.name || 'Varsayılan'} ▶
                        </span>
                      </button>

                      <button
                        onClick={() => setActiveSettingsTab('quality')}
                        tabIndex={111}
                        className="flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-white/10 text-xs font-medium text-zinc-200 text-left"
                      >
                        <div className="flex items-center gap-2">
                          <Sliders size={13} />
                          <span>Kalite</span>
                        </div>
                        <span className="text-[11px] text-zinc-400">
                          {selectedQuality === -1 ? 'Otomatik' : `${qualities[selectedQuality]?.height}p`} ▶
                        </span>
                      </button>
                    </>
                  )}

                  {activeSettingsTab === 'audio' && (
                    <>
                      <button
                        onClick={() => setActiveSettingsTab('main')}
                        className="px-2 py-1 text-[11px] font-semibold text-zinc-400 hover:text-white text-left"
                      >
                        ◀ Geri
                      </button>
                      <div className="text-[11px] font-semibold text-white px-2 mb-1">Ses Parçası</div>
                      {audioTracks.length > 0 ? (
                        audioTracks.map((track, idx) => (
                          <button
                            key={`track-${idx}`}
                            onClick={() => changeAudioTrack(idx)}
                            tabIndex={112 + idx}
                            className={`flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition-colors ${
                              selectedAudio === idx ? 'bg-white/20 text-white font-semibold' : 'hover:bg-white/5 text-zinc-300'
                            }`}
                          >
                            <span>{track.name || track.lang || `Kanal ${idx + 1}`}</span>
                            {selectedAudio === idx && <Check size={13} />}
                          </button>
                        ))
                      ) : (
                        <div className="text-xs text-zinc-400 px-2 py-1">Standart Ses</div>
                      )}
                    </>
                  )}

                  {activeSettingsTab === 'quality' && (
                    <>
                      <button
                        onClick={() => setActiveSettingsTab('main')}
                        className="px-2 py-1 text-[11px] font-semibold text-zinc-400 hover:text-white text-left"
                      >
                        ◀ Geri
                      </button>
                      <div className="text-[11px] font-semibold text-white px-2 mb-1">Çözünürlük</div>
                      <button
                        onClick={() => changeQuality(-1)}
                        tabIndex={120}
                        className={`flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition-colors ${
                          selectedQuality === -1 ? 'bg-white/20 text-white font-semibold' : 'hover:bg-white/5 text-zinc-300'
                        }`}
                      >
                        <span>Otomatik</span>
                        {selectedQuality === -1 && <Check size={13} />}
                      </button>
                      {qualities.map((q, idx) => (
                        <button
                          key={`quality-${idx}`}
                          onClick={() => changeQuality(idx)}
                          tabIndex={121 + idx}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition-colors ${
                            selectedQuality === idx ? 'bg-white/20 text-white font-semibold' : 'hover:bg-white/5 text-zinc-300'
                          }`}
                        >
                          <span>{q.height || 'Auto'}p</span>
                          {selectedQuality === idx && <Check size={13} />}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
