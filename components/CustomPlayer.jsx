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
  Tv,
  Subtitles,
  Languages
} from 'lucide-react';

export default function CustomPlayer({
  streamUrl,
  subtitles = [],
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
  const [selectedSubtitle, setSelectedSubtitle] = useState(-1); // -1: Kapalı
  const [qualities, setQualities] = useState([]);
  const [selectedQuality, setSelectedQuality] = useState(-1);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState('main'); // 'main' | 'audio' | 'subtitle' | 'quality'

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
        try {
          video.currentTime = initialTime;
          initialSeekDoneRef.current = true;
          showToast(`Kaldığınız yerden devam ediliyor (${formatTime(initialTime)})`);
        } catch (e) {
          console.warn('Seek error:', e);
        }
      }
    };

    const handleLoadedMetadata = () => {
      applyInitialSeek();
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('canplay', handleLoadedMetadata);

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

      const syncAudioTracks = (tracksList) => {
        const tracks = tracksList || hls.audioTracks || [];
        if (tracks.length > 0) {
          setAudioTracks([...tracks]);
          if (hls.audioTrack >= 0) {
            setSelectedAudio(hls.audioTrack);
          }
        }
      };

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        applyInitialSeek();
        video.play().catch(e => console.log('Oynatma bekleniyor:', e));
        setIsPlaying(true);

        if (hls.levels && hls.levels.length > 0) {
          setQualities(hls.levels);
        }

        syncAudioTracks();
      });

      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (event, data) => {
        syncAudioTracks(data?.audioTracks);
      });

      hls.on(Hls.Events.MANIFEST_LOADED, (event, data) => {
        syncAudioTracks(data?.audioTracks);
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
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.removeEventListener('canplay', handleLoadedMetadata);
        hls.destroy();
        hlsRef.current = null;
      };
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = finalUrl;
      video.play().catch(e => console.log('Native oynatma:', e));

      return () => {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.removeEventListener('canplay', handleLoadedMetadata);
      };
    }
  }, [streamUrl, initialTime, showToast]);

  // Zaman & Buffer & İlerleme Kaydetme
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let lastSavedTime = initialTime > 5 ? initialTime : 0;

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

  // Altyazı Parçaları Senkronizasyonu
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !video.textTracks) return;
    for (let i = 0; i < video.textTracks.length; i++) {
      video.textTracks[i].mode = (i === selectedSubtitle) ? 'showing' : 'hidden';
    }
  }, [selectedSubtitle, subtitles]);

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

  const formatAudioName = (name) => {
    if (!name) return 'Standart Ses';
    const lower = name.toLowerCase();
    if (lower.includes('turkish') || lower.includes('türkçe') || lower.includes('tur')) return 'Türkçe Dublaj';
    if (lower.includes('original') || lower.includes('orijinal') || lower.includes('eng') || lower.includes('english')) return 'Orijinal Ses (İngilizce)';
    if (lower.includes('german') || lower.includes('almanca') || lower.includes('deu')) return 'Almanca';
    if (lower.includes('french') || lower.includes('fransızca') || lower.includes('fra')) return 'Fransızca';
    if (lower.includes('spanish') || lower.includes('ispanyolca') || lower.includes('spa')) return 'İspanyolca';
    return name;
  };

  const toggleAudioTrack = useCallback(() => {
    if (!hlsRef.current || audioTracks.length < 2) {
      showToast('Tek ses kanalı mevcut');
      return;
    }
    const nextTrack = (selectedAudio + 1) % audioTracks.length;
    setSelectedAudio(nextTrack);
    hlsRef.current.audioTrack = nextTrack;
    const trackName = formatAudioName(audioTracks[nextTrack]?.name || audioTracks[nextTrack]?.lang || `Kanal ${nextTrack + 1}`);
    showToast(`🔊 Ses Dili: ${trackName}`);
  }, [audioTracks, selectedAudio, showToast]);

  const toggleSubtitle = useCallback(() => {
    if (!subtitles || subtitles.length === 0) {
      showToast('Bu video için altyazı bulunamadı');
      return;
    }
    const nextIdx = selectedSubtitle < subtitles.length - 1 ? selectedSubtitle + 1 : -1;
    setSelectedSubtitle(nextIdx);
    showToast(nextIdx === -1 ? '💬 Altyazı: Kapalı' : `💬 Altyazı: ${subtitles[nextIdx]?.label || 'Açık'}`);
  }, [subtitles, selectedSubtitle, showToast]);

  const changeSubtitle = useCallback((idx) => {
    setSelectedSubtitle(idx);
    showToast(idx === -1 ? '💬 Altyazı: Kapalı' : `💬 Altyazı: ${subtitles[idx]?.label || 'Açık'}`);
    setShowSettingsMenu(false);
  }, [subtitles, showToast]);

  // SMART TV KUMANDA NUMARATİK KISAYOLLARI (0-9) & KLAVYE DİNLEYİCİSİ
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
        return;
      }

      const video = videoRef.current;
      if (!video) return;

      const key = e.key;

      // --- 1. SMART TV KUMANDASI NUMARA TUŞLARI (0-9) ---
      if (key === '5') {
        e.preventDefault();
        showControlsTemporarily();
        togglePlay();
      } else if (key === '4') {
        e.preventDefault();
        showControlsTemporarily();
        seek(-10);
      } else if (key === '6') {
        e.preventDefault();
        showControlsTemporarily();
        seek(10);
      } else if (key === '8') {
        e.preventDefault();
        // Ses açarken medya kontrollerini ekrana basma, sadece mini ses rozeti göster
        const newVol = Math.min(1, Math.round((video.volume + 0.1) * 10) / 10);
        video.volume = newVol;
        setVolume(newVol);
        setIsMuted(false);
        showToast(`🔊 Ses: %${Math.round(newVol * 100)}`);
      } else if (key === '2') {
        e.preventDefault();
        // Ses kısarken medya kontrollerini ekrana basma, sadece mini ses rozeti göster
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
        showControlsTemporarily();
        if (hasPrev && onPrevEpisode) {
          showToast('◀ Önceki Bölüme Geçiliyor...');
          onPrevEpisode();
        } else {
          showToast('İlk bölümdesiniz');
        }
      } else if (key === '3') {
        e.preventDefault();
        showControlsTemporarily();
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
        showControlsTemporarily();
        togglePlay();
      } else if (key === 'c' || key === 'C') {
        e.preventDefault();
        toggleSubtitle();
      } else if (key === 'ArrowRight' || key === 'MediaFastForward') {
        e.preventDefault();
        showControlsTemporarily();
        seek(10);
      } else if (key === 'ArrowLeft' || key === 'MediaRewind') {
        e.preventDefault();
        showControlsTemporarily();
        seek(-10);
      } else if (key === 'ArrowUp') {
        e.preventDefault();
        // Ses açarken orta medya tuşlarını ekrana çıkarma
        const newVol = Math.min(1, Math.round((video.volume + 0.1) * 10) / 10);
        video.volume = newVol;
        setVolume(newVol);
        setIsMuted(false);
        showToast(`🔊 Ses: %${Math.round(newVol * 100)}`);
      } else if (key === 'ArrowDown') {
        e.preventDefault();
        // Ses kısarken orta medya tuşlarını ekrana çıkarma
        const newVol = Math.max(0, Math.round((video.volume - 0.1) * 10) / 10);
        video.volume = newVol;
        setVolume(newVol);
        showToast(`🔉 Ses: %${Math.round(newVol * 100)}`);
      } else if (key === 'm' || key === 'M') {
        e.preventDefault();
        video.muted = !video.muted;
        setIsMuted(video.muted);
        showToast(video.muted ? '🔇 Ses Kapatıldı' : '🔊 Ses Açıldı');
      } else if (key === 'f' || key === 'F') {
        e.preventDefault();
        toggleNativeFullscreen();
      } else if (key === 'n' || key === 'N' || key === 'MediaTrackNext') {
        showControlsTemporarily();
        if (hasNext && onNextEpisode) onNextEpisode();
      } else if (key === 'p' || key === 'P' || key === 'MediaTrackPrevious') {
        showControlsTemporarily();
        if (hasPrev && onPrevEpisode) onPrevEpisode();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showControlsTemporarily, togglePlay, seek, toggleNativeFullscreen, toggleAudioTrack, toggleSubtitle, hasNext, hasPrev, onNextEpisode, onPrevEpisode, showToast]);

  // SESLİ ASİSTAN & GOOGLE HOME CANLI KOMUT DİNLEYİCİSİ (remote-player-command)
  useEffect(() => {
    const handleRemoteCommand = (e) => {
      const { action, payload } = e.detail || {};
      const video = videoRef.current;
      if (!video) return;

      showControlsTemporarily();

      switch (action) {
        case 'play':
          video.play().catch(() => {});
          break;
        case 'pause':
          video.pause();
          break;
        case 'toggle_play':
          togglePlay();
          break;
        case 'seek':
        case 'seek_forward':
        case 'seek_backward':
          const delta = payload?.delta || 15;
          seek(delta);
          break;
        case 'next_episode':
          if (hasNext && onNextEpisode) {
            showToast('Sonraki Bölüme Geçiliyor ▶');
            onNextEpisode();
          } else {
            showToast('Son bölümdesiniz');
          }
          break;
        case 'prev_episode':
          if (hasPrev && onPrevEpisode) {
            showToast('◀ Önceki Bölüme Geçiliyor...');
            onPrevEpisode();
          } else {
            showToast('İlk bölümdesiniz');
          }
          break;
        case 'fullscreen':
          if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            toggleNativeFullscreen();
          }
          break;
        case 'exit_fullscreen':
          if (document.fullscreenElement || document.webkitFullscreenElement) {
            toggleNativeFullscreen();
          }
          break;
        case 'toggle_fullscreen':
          toggleNativeFullscreen();
          break;
        case 'volume_up': {
          const newVol = Math.min(1, Math.round((video.volume + (payload?.delta || 0.15)) * 10) / 10);
          video.volume = newVol;
          setVolume(newVol);
          setIsMuted(false);
          showToast(`🔊 Ses: %${Math.round(newVol * 100)}`);
          break;
        }
        case 'volume_down': {
          const newVol = Math.max(0, Math.round((video.volume - (payload?.delta || 0.15)) * 10) / 10);
          video.volume = newVol;
          setVolume(newVol);
          showToast(`🔉 Ses: %${Math.round(newVol * 100)}`);
          break;
        }
        case 'mute':
        case 'toggle_mute':
          video.muted = !video.muted;
          setIsMuted(video.muted);
          showToast(video.muted ? '🔇 Ses Kapatıldı' : '🔊 Ses Açıldı');
          break;
        case 'toggle_audio':
          toggleAudioTrack();
          break;
        case 'toggle_subtitle':
          toggleSubtitle();
          break;
        default:
          break;
      }
    };

    window.addEventListener('remote-player-command', handleRemoteCommand);
    return () => window.removeEventListener('remote-player-command', handleRemoteCommand);
  }, [showControlsTemporarily, togglePlay, seek, toggleNativeFullscreen, toggleAudioTrack, toggleSubtitle, hasNext, hasPrev, onNextEpisode, onPrevEpisode, showToast]);

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
    const name = formatAudioName(audioTracks[trackId]?.name || audioTracks[trackId]?.lang || `Kanal ${trackId + 1}`);
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
          ? 'player-fullscreen fixed inset-0 w-screen h-screen z-[99999] rounded-none border-0'
          : 'rounded-none sm:rounded-2xl border-0 sm:border border-white/10 shadow-2xl'
      }`}
    >
      {/* 1. Tek ve Ana Video Katmanı */}
      <video
        ref={videoRef}
        playsInline
        crossOrigin="anonymous"
        className="w-full h-full object-contain bg-black pointer-events-none"
      >
        {subtitles.map((sub, idx) => (
          <track
            key={`sub-${idx}-${sub.url}`}
            kind="subtitles"
            src={sub.url}
            srcLang={sub.lang || 'tr'}
            label={sub.label}
          />
        ))}
      </video>

      {/* 2. Anlık Bilgilendirme Rozeti (Sarma / Ses / Kanal / Altyazı) */}
      {actionNotification && (
        <div className="absolute top-3 left-3 sm:top-5 sm:left-5 md:top-6 md:left-6 z-40 px-2.5 py-1.5 sm:px-4 sm:py-2 md:px-5 md:py-2.5 rounded-lg sm:rounded-xl bg-black/90 backdrop-blur-md border border-white/20 text-white text-xs sm:text-sm md:text-base lg:text-lg font-semibold flex items-center gap-2 sm:gap-3 shadow-2xl animate-in fade-in duration-200">
          <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 md:w-3 md:h-3 rounded-full bg-emerald-400 animate-pulse" />
          <span>{actionNotification}</span>
        </div>
      )}

      {/* 3. TEK VE BİRLEŞİK KONTROL ARAYÜZÜ (Fade in / out) */}
      <div
        className={`absolute inset-0 flex flex-col justify-between p-3 sm:p-5 md:p-7 lg:p-9 bg-gradient-to-t from-black/90 via-black/20 to-black/70 transition-opacity duration-200 ${
          showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* ÜST ÇUBUK: Başlık ve Ayarlar Menüsü (Altyazı, Dil ve Kumanda ayarlar içinde) */}
        <div className="flex justify-between items-center w-full gap-2">
          <span className={`font-semibold text-white/95 truncate drop-shadow-md tracking-wide ${
            isFullscreen
              ? 'text-xs sm:text-sm md:text-base max-w-sm sm:max-w-md md:max-w-xl'
              : 'text-xs sm:text-sm md:text-base max-w-[180px] sm:max-w-md'
          }`}>
            {title}
          </span>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Ses Dili, Altyazı, Kalite ve Kumanda Kılavuzu Açılır Menüsü */}
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setShowSettingsMenu(!showSettingsMenu); }}
                className={`flex items-center gap-1.5 rounded-lg border transition-all ${
                  isFullscreen ? 'px-2 py-1 text-xs' : 'px-2.5 py-1.5 text-xs sm:text-sm'
                } ${
                  showSettingsMenu
                    ? 'bg-white/30 text-white font-semibold border-white/50 backdrop-blur-md shadow-lg'
                    : 'bg-white/10 hover:bg-white/20 text-zinc-200 border-white/15 backdrop-blur-md'
                }`}
                title="Ayarlar (Ses Dili, Altyazı, Kalite, Kumanda)"
              >
                <Sliders className={isFullscreen ? "w-3.5 h-3.5" : "w-3.5 h-3.5 sm:w-4 sm:h-4"} />
                <span>Ayarlar</span>
              </button>

              {showSettingsMenu && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute top-9 sm:top-10 right-0 w-64 sm:w-72 bg-[#14151e]/95 backdrop-blur-xl border border-white/20 rounded-xl p-2 sm:p-2.5 shadow-2xl flex flex-col gap-1 z-50 animate-in fade-in zoom-in-95 duration-150"
                >
                  {activeSettingsTab === 'main' && (
                    <>
                      <div className="flex items-center justify-between px-2 py-1 border-b border-white/10 pb-1.5">
                        <span className="text-xs font-semibold text-zinc-400">Oynatıcı Ayarları</span>
                        <button onClick={() => setShowSettingsMenu(false)} className="text-zinc-400 hover:text-white p-1">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* 1. Ses Dili Menü Satırı */}
                      <button
                        onClick={() => setActiveSettingsTab('audio')}
                        className="flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-white/10 text-xs sm:text-sm font-medium text-zinc-200 text-left transition-colors"
                      >
                        <div className="flex items-center gap-2 sm:gap-2.5">
                          <Languages className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" />
                          <span>Ses Dili</span>
                        </div>
                        <span className="text-[11px] sm:text-xs text-zinc-400 truncate max-w-[110px]">
                          {formatAudioName(audioTracks[selectedAudio]?.name)} ▶
                        </span>
                      </button>

                      {/* 2. Altyazı Menü Satırı */}
                      <button
                        onClick={() => setActiveSettingsTab('subtitle')}
                        className="flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-white/10 text-xs sm:text-sm font-medium text-zinc-200 text-left transition-colors"
                      >
                        <div className="flex items-center gap-2 sm:gap-2.5">
                          <Subtitles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-400" />
                          <span>Altyazı</span>
                        </div>
                        <span className="text-[11px] sm:text-xs text-zinc-400 truncate max-w-[110px]">
                          {selectedSubtitle === -1 ? 'Kapalı' : (subtitles[selectedSubtitle]?.label || 'Açık')} ▶
                        </span>
                      </button>

                      {/* 3. Kalite Menü Satırı */}
                      <button
                        onClick={() => setActiveSettingsTab('quality')}
                        className="flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-white/10 text-xs sm:text-sm font-medium text-zinc-200 text-left transition-colors"
                      >
                        <div className="flex items-center gap-2 sm:gap-2.5">
                          <Sliders className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
                          <span>Kalite</span>
                        </div>
                        <span className="text-[11px] sm:text-xs text-zinc-400">
                          {selectedQuality === -1 ? 'Otomatik' : `${qualities[selectedQuality]?.height}p`} ▶
                        </span>
                      </button>

                      {/* 4. Kumanda Numaraları Kılavuzu (0-9) */}
                      <button
                        onClick={() => { setShowRemoteHelp(true); setShowSettingsMenu(false); }}
                        className="flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-white/10 text-xs sm:text-sm font-medium text-zinc-200 text-left transition-colors border-t border-white/5 pt-2 mt-0.5"
                      >
                        <div className="flex items-center gap-2 sm:gap-2.5">
                          <Tv className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-400" />
                          <span>Kumanda Kılavuzu</span>
                        </div>
                        <span className="text-[11px] sm:text-xs text-zinc-400">
                          (0-9) ▶
                        </span>
                      </button>
                    </>
                  )}

                  {/* 1. Ses Parçası Seçim Sekmesi */}
                  {activeSettingsTab === 'audio' && (
                    <>
                      <button
                        onClick={() => setActiveSettingsTab('main')}
                        className="px-2 py-1 text-xs sm:text-sm font-semibold text-zinc-400 hover:text-white text-left"
                      >
                        ◀ Geri
                      </button>
                      <div className="text-xs sm:text-sm font-semibold text-white px-2 mb-1">Ses Parçası</div>
                      {audioTracks.length > 0 ? (
                        audioTracks.map((track, idx) => (
                          <button
                            key={`track-${idx}`}
                            onClick={() => changeAudioTrack(idx)}
                            className={`flex items-center justify-between px-2.5 py-1.5 rounded text-xs sm:text-sm transition-colors ${
                              selectedAudio === idx ? 'bg-white/20 text-white font-semibold' : 'hover:bg-white/5 text-zinc-300'
                            }`}
                          >
                            <span>{formatAudioName(track.name || track.lang || `Kanal ${idx + 1}`)}</span>
                            {selectedAudio === idx && <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                          </button>
                        ))
                      ) : (
                        <div className="text-xs sm:text-sm text-zinc-400 px-2 py-1">Standart Ses</div>
                      )}
                    </>
                  )}

                  {/* 2. Altyazı Seçim Sekmesi */}
                  {activeSettingsTab === 'subtitle' && (
                    <>
                      <button
                        onClick={() => setActiveSettingsTab('main')}
                        className="px-2 py-1 text-xs sm:text-sm font-semibold text-zinc-400 hover:text-white text-left"
                      >
                        ◀ Geri
                      </button>
                      <div className="text-xs sm:text-sm font-semibold text-white px-2 mb-1">Altyazı Seçimi</div>
                      <button
                        onClick={() => changeSubtitle(-1)}
                        className={`flex items-center justify-between px-2.5 py-1.5 rounded text-xs sm:text-sm transition-colors ${
                          selectedSubtitle === -1 ? 'bg-white/20 text-white font-semibold' : 'hover:bg-white/5 text-zinc-300'
                        }`}
                      >
                        <span>Kapalı</span>
                        {selectedSubtitle === -1 && <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                      </button>
                      {subtitles.length > 0 ? (
                        subtitles.map((sub, idx) => (
                          <button
                            key={`sub-opt-${idx}`}
                            onClick={() => changeSubtitle(idx)}
                            className={`flex items-center justify-between px-2.5 py-1.5 rounded text-xs sm:text-sm transition-colors ${
                              selectedSubtitle === idx ? 'bg-white/20 text-white font-semibold' : 'hover:bg-white/5 text-zinc-300'
                            }`}
                          >
                            <span>{sub.label}</span>
                            {selectedSubtitle === idx && <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                          </button>
                        ))
                      ) : (
                        <div className="text-xs sm:text-sm text-zinc-400 px-2 py-1">Bu video için altyazı yok</div>
                      )}
                    </>
                  )}

                  {/* 3. Kalite / Çözünürlük Seçim Sekmesi */}
                  {activeSettingsTab === 'quality' && (
                    <>
                      <button
                        onClick={() => setActiveSettingsTab('main')}
                        className="px-2 py-1 text-xs sm:text-sm font-semibold text-zinc-400 hover:text-white text-left"
                      >
                        ◀ Geri
                      </button>
                      <div className="text-xs sm:text-sm font-semibold text-white px-2 mb-1">Çözünürlük</div>
                      <button
                        onClick={() => changeQuality(-1)}
                        className={`flex items-center justify-between px-2.5 py-1.5 rounded text-xs sm:text-sm transition-colors ${
                          selectedQuality === -1 ? 'bg-white/20 text-white font-semibold' : 'hover:bg-white/5 text-zinc-300'
                        }`}
                      >
                        <span>Otomatik</span>
                        {selectedQuality === -1 && <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                      </button>
                      {qualities.map((q, idx) => (
                        <button
                          key={`quality-${idx}`}
                          onClick={() => changeQuality(idx)}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded text-xs sm:text-sm transition-colors ${
                            selectedQuality === idx ? 'bg-white/20 text-white font-semibold' : 'hover:bg-white/5 text-zinc-300'
                          }`}
                        >
                          <span>{q.height || 'Auto'}p</span>
                          {selectedQuality === idx && <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
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
        <div className={`flex items-center justify-center my-auto transition-all duration-200 ${
          isFullscreen
            ? 'gap-3 sm:gap-4 md:gap-6'
            : 'gap-3 sm:gap-4 md:gap-5'
        }`}>
          {/* Önceki Bölüm (Varsa) */}
          {hasPrev && (
            <button
              onClick={(e) => { e.stopPropagation(); onPrevEpisode(); }}
              className={`rounded-full bg-black/40 hover:bg-black/60 text-white/70 hover:text-white backdrop-blur-md transition-transform active:scale-90 border border-white/10 ${
                isFullscreen
                  ? 'p-1.5 sm:p-2 md:p-2.5'
                  : 'p-2 sm:p-2.5'
              }`}
              title="[1] Önceki Bölüm"
            >
              <SkipBack className={isFullscreen ? "w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-4.5 md:h-4.5" : "w-4 h-4 sm:w-5 sm:h-5"} />
            </button>
          )}

          {/* 10sn Geri Sar */}
          <button
            onClick={(e) => { e.stopPropagation(); seek(-10); }}
            className={`rounded-full bg-black/40 hover:bg-black/60 text-white/80 hover:text-white backdrop-blur-md transition-transform active:scale-90 border border-white/10 ${
              isFullscreen
                ? 'p-2 sm:p-2.5 md:p-3'
                : 'p-2.5 sm:p-3'
            }`}
            title="[4] 10sn Geri"
          >
            <RotateCcw className={isFullscreen ? "w-4.5 h-4.5 sm:w-5 sm:h-5 md:w-5.5 md:h-5.5" : "w-4.5 h-4.5 sm:w-5.5 sm:h-5.5"} />
          </button>

          {/* Merkez OYNAT / DURDUR Butonu - BULANIK SAYDAM (BEYAZ DEĞİL) */}
          <button
            onClick={(e) => { e.stopPropagation(); togglePlay(); }}
            className={`rounded-full bg-white/20 hover:bg-white/30 text-white backdrop-blur-xl border border-white/30 hover:border-white/50 transition-all active:scale-90 shadow-[0_8px_32px_rgba(0,0,0,0.5)] ${
              isFullscreen
                ? 'p-3 sm:p-3.5 md:p-4'
                : 'p-3.5 sm:p-4 md:p-5'
            }`}
            title={isPlaying ? '[5] Durdur' : '[5] Oynat'}
          >
            {isPlaying ? (
              <Pause className={isFullscreen ? "w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8" : "w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8"} />
            ) : (
              <Play className={`${isFullscreen ? "w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8" : "w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8"} ml-0.5`} />
            )}
          </button>

          {/* 10sn İleri Sar */}
          <button
            onClick={(e) => { e.stopPropagation(); seek(10); }}
            className={`rounded-full bg-black/40 hover:bg-black/60 text-white/80 hover:text-white backdrop-blur-md transition-transform active:scale-90 border border-white/10 ${
              isFullscreen
                ? 'p-2 sm:p-2.5 md:p-3'
                : 'p-2.5 sm:p-3'
            }`}
            title="[6] 10sn İleri"
          >
            <RotateCw className={isFullscreen ? "w-4.5 h-4.5 sm:w-5 sm:h-5 md:w-5.5 md:h-5.5" : "w-4.5 h-4.5 sm:w-5.5 sm:h-5.5"} />
          </button>

          {/* Sonraki Bölüm (Varsa) */}
          {hasNext && (
            <button
              onClick={(e) => { e.stopPropagation(); onNextEpisode(); }}
              className={`rounded-full bg-black/40 hover:bg-black/60 text-white/70 hover:text-white backdrop-blur-md transition-transform active:scale-90 border border-white/10 ${
                isFullscreen
                  ? 'p-1.5 sm:p-2 md:p-2.5'
                  : 'p-2 sm:p-2.5'
              }`}
              title="[3] Sonraki Bölüm"
            >
              <SkipForward className={isFullscreen ? "w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-4.5 md:h-4.5" : "w-4 h-4 sm:w-5 sm:h-5"} />
            </button>
          )}
        </div>

        {/* ALT ÇUBUK: İlerleme Çubuğu, Süre ve Tam Ekran (Tam ekranda kompakt) */}
        <div className={`flex flex-col w-full ${isFullscreen ? 'gap-1.5 sm:gap-2' : 'gap-2 sm:gap-2.5'}`}>
          {/* İlerleme Çubuğu (Scrubber) */}
          <div
            onClick={handleScrub}
            className={`relative w-full bg-white/20 rounded-full cursor-pointer transition-all flex items-center ${
              isFullscreen ? 'h-1.5 hover:h-2' : 'h-1.5 sm:h-2 hover:h-2.5'
            }`}
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
            {/* Sol: Oynat/Durdur, Süre & Ses Kontrolü */}
            <div className="flex items-center gap-1.5 sm:gap-2.5">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                className={`rounded-lg hover:bg-white/10 text-white transition-colors ${
                  isFullscreen ? 'p-1' : 'p-1 sm:p-1.5'
                }`}
                title={isPlaying ? 'Durdur (Space / 5)' : 'Oynat (Space / 5)'}
              >
                {isPlaying ? (
                  <Pause className={isFullscreen ? "w-3.5 h-3.5 sm:w-4 sm:h-4" : "w-4 h-4 sm:w-5 sm:h-5"} />
                ) : (
                  <Play className={`${isFullscreen ? "w-3.5 h-3.5 sm:w-4 sm:h-4" : "w-4 h-4 sm:w-5 sm:h-5"} ml-0.5`} />
                )}
              </button>

              <div className={`font-mono text-zinc-300 ${
                isFullscreen ? 'text-[11px] sm:text-xs' : 'text-[11px] sm:text-xs md:text-sm'
              }`}>
                <span className="text-white font-semibold">{formatTime(currentTime)}</span>
                <span className="mx-1 text-zinc-500">/</span>
                <span>{formatTime(duration)}</span>
              </div>

              <div className="hidden sm:flex items-center gap-1.5 ml-1">
                <button
                  onClick={toggleMute}
                  className={`rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white ${
                    isFullscreen ? 'p-1' : 'p-1 sm:p-1.5'
                  }`}
                  title="[9] Sessiz"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className={isFullscreen ? "w-3.5 h-3.5 sm:w-4 sm:h-4" : "w-4 h-4 sm:w-5 sm:h-5"} />
                  ) : (
                    <Volume2 className={isFullscreen ? "w-3.5 h-3.5 sm:w-4 sm:h-4" : "w-4 h-4 sm:w-5 sm:h-5"} />
                  )}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className={`bg-white/30 rounded accent-white cursor-pointer ${
                    isFullscreen ? 'w-16 h-1' : 'w-16 sm:w-20 md:w-24 h-1 sm:h-1.5'
                  }`}
                />
              </div>
            </div>

            {/* Sağ: Tam Ekran Butonu */}
            <button
              onClick={(e) => { e.stopPropagation(); toggleNativeFullscreen(); }}
              className={`rounded-lg bg-white/10 hover:bg-white/20 text-zinc-200 hover:text-white transition-colors ${
                isFullscreen ? 'p-1.5' : 'p-1.5 sm:p-2'
              }`}
              title="[0] Tam Ekran"
            >
              {isFullscreen ? (
                <Minimize className={isFullscreen ? "w-3.5 h-3.5 sm:w-4 sm:h-4" : "w-4 h-4 sm:w-5 sm:h-5"} />
              ) : (
                <Maximize className={isFullscreen ? "w-3.5 h-3.5 sm:w-4 sm:h-4" : "w-4 h-4 sm:w-5 sm:h-5"} />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 4. SMART TV KUMANDA REHBERİ MODALI */}
      {showRemoteHelp && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-0 bg-black/85 backdrop-blur-md z-50 p-4 sm:p-6 md:p-8 flex flex-col justify-center items-center text-white text-center animate-in fade-in"
        >
          <div className="flex items-center justify-between w-full max-w-sm sm:max-w-md md:max-w-lg lg:max-w-2xl mb-3 sm:mb-4">
            <h3 className="text-sm sm:text-base md:text-lg lg:text-xl font-bold flex items-center gap-2">
              <Tv className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" /> Smart TV Kumanda Numaraları
            </h3>
            <button onClick={() => setShowRemoteHelp(false)} className="p-1 sm:p-1.5 text-zinc-400 hover:text-white">
              <X className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-3 md:gap-4 w-full max-w-sm sm:max-w-md md:max-w-lg lg:max-w-2xl text-xs sm:text-sm md:text-base">
            <div className="p-2 sm:p-3 rounded-xl bg-white/10 border border-white/10"><b className="text-emerald-400 text-sm sm:text-base md:text-lg">1</b><br/>Önceki Bölüm</div>
            <div className="p-2 sm:p-3 rounded-xl bg-white/10 border border-white/10"><b className="text-emerald-400 text-sm sm:text-base md:text-lg">2</b><br/>Ses Kıs (-10)</div>
            <div className="p-2 sm:p-3 rounded-xl bg-white/10 border border-white/10"><b className="text-emerald-400 text-sm sm:text-base md:text-lg">3</b><br/>Sonraki Bölüm</div>
            
            <div className="p-2 sm:p-3 rounded-xl bg-white/10 border border-white/10"><b className="text-emerald-400 text-sm sm:text-base md:text-lg">4</b><br/>10sn Geri</div>
            <div className="p-2 sm:p-3 rounded-xl bg-white/20 border border-white/20"><b className="text-emerald-400 text-sm sm:text-base md:text-lg">5</b><br/>Oynat / Durdur</div>
            <div className="p-2 sm:p-3 rounded-xl bg-white/10 border border-white/10"><b className="text-emerald-400 text-sm sm:text-base md:text-lg">6</b><br/>10sn İleri</div>

            <div className="p-2 sm:p-3 rounded-xl bg-white/10 border border-white/10"><b className="text-emerald-400 text-sm sm:text-base md:text-lg">7</b><br/>Ses Dili (TR/EN)</div>
            <div className="p-2 sm:p-3 rounded-xl bg-white/10 border border-white/10"><b className="text-emerald-400 text-sm sm:text-base md:text-lg">8</b><br/>Ses Aç (+10)</div>
            <div className="p-2 sm:p-3 rounded-xl bg-white/10 border border-white/10"><b className="text-emerald-400 text-sm sm:text-base md:text-lg">9</b><br/>Sessiz (Mute)</div>
            
            <div className="col-span-3 p-2.5 sm:p-3.5 rounded-xl bg-white/10 border border-white/10 flex items-center justify-around text-xs sm:text-sm md:text-base">
              <span><b className="text-emerald-400">0</b> : Tam Ekran</span>
              <span className="text-zinc-600">•</span>
              <span><b className="text-emerald-400">C</b> : Altyazı</span>
              <span className="text-zinc-600">•</span>
              <span><b className="text-emerald-400">7</b> : Ses Dili</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
