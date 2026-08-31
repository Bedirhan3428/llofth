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
      if (!showSettingsMenu && !showRemoteHelp && isPlaying) {
        setShowControls(false);
      }
    }, 3500);
  }, [showSettingsMenu, showRemoteHelp, isPlaying]);

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
      } catch (e) {}
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

      try {
        if (screen.orientation && screen.orientation.unlock) {
          screen.orientation.unlock();
        } else if (screen.unlockOrientation) {
          screen.unlockOrientation();
        }
      } catch (e) {}
    }
  }, []);

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
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
        return;
      }

      showControlsTemporarily();
      const video = videoRef.current;
      if (!video) return;

      const key = e.key;

      // --- 1. SMART TV KUMANDASI NUMARA TUŞLARI (0-9) ---
      if (key === '5') {
        e.preventDefault();
        togglePlay();
      } else if (key === '4') {
        e.preventDefault();
        seek(-10);
      } else if (key === '6') {
        e.preventDefault();
        seek(10);
      } else if (key === '8') {
        e.preventDefault();
        const newVol = Math.min(1, Math.round((video.volume + 0.1) * 10) / 10);
        video.volume = newVol;
        setVolume(newVol);
        setIsMuted(false);
        showToast(`🔊 Ses: %${Math.round(newVol * 100)}`);
      } else if (key === '2') {
        e.preventDefault();
        const newVol = Math.max(0, Math.round((video.volume - 0.1) * 10) / 10);
        video.volume = newVol;
        setVolume(newVol);
        showToast(`🔉 Ses: %${Math.round(newVol * 100)}`);
      } else if (key === '0') {
        e.preventDefault();
        toggleNativeFullscreen();
      } else if (key === '7') {
        e.preventDefault();
        toggleAudioTrack();
      } else if (key === '9') {
        e.preventDefault();
        video.muted = !video.muted;
        setIsMuted(video.muted);
        showToast(video.muted ? '🔇 Ses Kapatıldı' : '🔊 Ses Açıldı');
      } else if (key === '1') {
        e.preventDefault();
        if (hasPrev && onPrevEpisode) {
          showToast('◀ Önceki Bölüme Geçiliyor...');
          onPrevEpisode();
        } else {
          showToast('İlk bölümdesiniz');
        }
      } else if (key === '3') {
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
    e.stopPropagation();
    const video = videoRef.current;
    if (!video || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    video.currentTime = Math.max(0, Math.min(duration, pos * duration));
  };

  const toggleMute = (e) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
    showToast(video.muted ? '🔇 Ses Kapatıldı' : '🔊 Ses Açıldı');
  };

  const handleVolumeChange = (e) => {
    e.stopPropagation();
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

  // Ekrana Tek Tıklama: Kontroller Gizliyse Açar, Açıksa Kapatır
  const handleScreenClick = (e) => {
    // Butonlara, inputlara veya menüye tıklandıysa ana ekran tıklamasını yok say
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select') || e.target.closest('a')) {
      return;
    }

    if (!showControls) {
      // Kapalıysa aç ve 4 saniye sonra otomatik gizle
      setShowControls(true);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
      controlsTimerRef.current = setTimeout(() => {
        if (!showSettingsMenu && !showRemoteHelp && isPlaying) {
          setShowControls(false);
        }
      }, 4000);
    } else {
      // Zaten açıksa kapat
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
      setShowControls(false);
    }
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
      onMouseMove={() => {
        if (!showControls) {
          setShowControls(true);
        }
        if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
        controlsTimerRef.current = setTimeout(() => {
          if (!showSettingsMenu && !showRemoteHelp && isPlaying) {
            setShowControls(false);
          }
        }, 3500);
      }}
      className={`relative w-full aspect-video bg-black overflow-hidden select-none font-sans cursor-pointer ${
        isFullscreen
          ? 'fixed inset-0 w-screen h-screen z-[99999] rounded-none border-0'
          : 'rounded-none sm:rounded-2xl border-0 sm:border border-white/10 shadow-2xl'
      }`}
    >
      {/* 1. Tek ve Ana Video Katmanı */}
      <video
        ref={videoRef}
        playsInline
        className="w-full h-full object-contain bg-black pointer-events-none"
      />

      {/* 2. Anlık Bilgilendirme Rozeti (Sarma / Ses / Kanal) */}
      {actionNotification && (
        <div className="absolute top-3 left-3 sm:top-4 sm:left-4 z-40 px-3 py-1.5 rounded-lg bg-black/90 backdrop-blur-md border border-white/20 text-white text-xs font-semibold flex items-center gap-2 shadow-2xl animate-in fade-in duration-200">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>{actionNotification}</span>
        </div>
      )}

      {/* 3. TEK VE BİRLEŞİK KONTROL ARAYÜZÜ (Fade in / out) */}
      <div
        className={`absolute inset-0 flex flex-col justify-between p-3 sm:p-5 bg-gradient-to-t from-black/90 via-black/20 to-black/70 transition-opacity duration-200 ${
          showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* ÜST ÇUBUK: Başlık, Kumanda Rehberi ve Ayarlar */}
        <div className="flex justify-between items-center w-full">
          <span className="text-[11px] sm:text-xs font-semibold text-white/90 truncate max-w-[200px] sm:max-w-md drop-shadow">
            {title}
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); setShowRemoteHelp(!showRemoteHelp); }}
              className="flex items-center gap-1 text-[10px] sm:text-[11px] text-zinc-300 bg-white/10 hover:bg-white/20 px-2 py-1 rounded-md border border-white/10 transition-colors"
              title="Kumanda Numaraları Kılavuzu"
            >
              <Tv size={12} />
              <span>Kumanda (0-9)</span>
            </button>

            {/* Ses Dili ve Kalite Açılır Menüsü */}
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setShowSettingsMenu(!showSettingsMenu); }}
                className={`p-1.5 rounded-md transition-colors ${
                  showSettingsMenu ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20 text-zinc-300'
                }`}
                title="Ses Dili & Kalite Ayarları"
              >
                <Sliders size={14} />
              </button>

              {showSettingsMenu && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute top-8 right-0 w-56 bg-[#14151e] border border-white/20 rounded-xl p-2 shadow-2xl flex flex-col gap-1 z-50 animate-in fade-in zoom-in-95 duration-150"
                >
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

        {/* ORTA BÖLGE: Merkeze Hizalanmış Oynat/Durdur & Geri/İleri 10sn Butonları */}
        <div className="flex items-center justify-center gap-6 sm:gap-10 my-auto">
          {/* Önceki Bölüm (Varsa) */}
          {hasPrev && (
            <button
              onClick={(e) => { e.stopPropagation(); onPrevEpisode(); }}
              className="p-2 sm:p-2.5 rounded-full bg-black/60 hover:bg-black/80 text-white/80 hover:text-white backdrop-blur-md transition-transform active:scale-90"
              title="[1] Önceki Bölüm"
            >
              <SkipBack size={18} className="sm:w-5 sm:h-5" />
            </button>
          )}

          {/* 10sn Geri Sar */}
          <button
            onClick={(e) => { e.stopPropagation(); seek(-10); }}
            className="p-2.5 sm:p-3.5 rounded-full bg-black/60 hover:bg-black/80 text-white/90 hover:text-white backdrop-blur-md transition-transform active:scale-90"
            title="[4] 10sn Geri"
          >
            <RotateCcw size={22} className="sm:w-6 sm:h-6" />
          </button>

          {/* Merkez OYNAT / DURDUR Butonu */}
          <button
            onClick={(e) => { e.stopPropagation(); togglePlay(); }}
            className="p-4 sm:p-5 rounded-full bg-white text-black hover:bg-zinc-200 backdrop-blur-md transition-transform active:scale-90 shadow-2xl"
            title={isPlaying ? '[5] Durdur' : '[5] Oynat'}
          >
            {isPlaying ? (
              <Pause size={28} className="sm:w-8 sm:h-8" />
            ) : (
              <Play size={28} className="sm:w-8 sm:h-8 ml-0.5" />
            )}
          </button>

          {/* 10sn İleri Sar */}
          <button
            onClick={(e) => { e.stopPropagation(); seek(10); }}
            className="p-2.5 sm:p-3.5 rounded-full bg-black/60 hover:bg-black/80 text-white/90 hover:text-white backdrop-blur-md transition-transform active:scale-90"
            title="[6] 10sn İleri"
          >
            <RotateCw size={22} className="sm:w-6 sm:h-6" />
          </button>

          {/* Sonraki Bölüm (Varsa) */}
          {hasNext && (
            <button
              onClick={(e) => { e.stopPropagation(); onNextEpisode(); }}
              className="p-2 sm:p-2.5 rounded-full bg-black/60 hover:bg-black/80 text-white/80 hover:text-white backdrop-blur-md transition-transform active:scale-90"
              title="[3] Sonraki Bölüm"
            >
              <SkipForward size={18} className="sm:w-5 sm:h-5" />
            </button>
          )}
        </div>

        {/* ALT ÇUBUK: İlerleme Çubuğu, Süre ve Tam Ekran */}
        <div className="flex flex-col gap-2 w-full">
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

          <div className="flex justify-between items-center text-white">
            {/* Sol: Süre & Ses Kontrolü */}
            <div className="flex items-center gap-2">
              <div className="text-[11px] sm:text-xs font-mono text-zinc-300">
                <span className="text-white font-semibold">{formatTime(currentTime)}</span>
                <span className="mx-1 text-zinc-500">/</span>
                <span>{formatTime(duration)}</span>
              </div>

              <div className="hidden sm:flex items-center gap-1.5 ml-2">
                <button
                  onClick={toggleMute}
                  className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white"
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
                  className="w-14 h-1 bg-white/30 rounded accent-white cursor-pointer"
                />
              </div>
            </div>

            {/* Sağ: Tam Ekran Butonu */}
            <button
              onClick={(e) => { e.stopPropagation(); toggleNativeFullscreen(); }}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-zinc-200 hover:text-white transition-colors"
              title="[0] Tam Ekran"
            >
              {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
            </button>
          </div>
        </div>
      </div>

      {/* 4. SMART TV KUMANDA REHBERİ MODALI */}
      {showRemoteHelp && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-0 bg-black/85 backdrop-blur-md z-50 p-4 sm:p-6 flex flex-col justify-center items-center text-white text-center animate-in fade-in"
        >
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
    </div>
  );
}
