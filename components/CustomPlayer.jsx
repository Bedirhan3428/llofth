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
  RotateCcw as ResumeIcon
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
  const [resumeNotification, setResumeNotification] = useState(null);

  // Menüler
  const [audioTracks, setAudioTracks] = useState([]);
  const [selectedAudio, setSelectedAudio] = useState(-1);
  const [qualities, setQualities] = useState([]);
  const [selectedQuality, setSelectedQuality] = useState(-1);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState('main'); // 'main' | 'audio' | 'quality'

  const [showControls, setShowControls] = useState(true);
  const controlsTimerRef = useRef(null);
  const initialSeekDoneRef = useRef(false);

  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => {
      if (!showSettingsMenu) {
        setShowControls(false);
      }
    }, 3500);
  }, [showSettingsMenu]);

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
        setResumeNotification(`Kaldığınız yerden devam ediliyor (${formatTime(initialTime)})`);
        setTimeout(() => setResumeNotification(null), 4000);
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
  }, [streamUrl, initialTime]);

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

  // Native Fullscreen Listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  // TV Kumandası & Klavye Dinleyicisi
  useEffect(() => {
    const handleKeyDown = (e) => {
      showControlsTemporarily();
      const video = videoRef.current;
      if (!video) return;

      if (e.key === ' ' || e.key === 'k') {
        e.preventDefault();
        if (video.paused) video.play(); else video.pause();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        video.currentTime = Math.max(0, video.currentTime - 10);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const newVol = Math.min(1, video.volume + 0.1);
        video.volume = newVol;
        setVolume(newVol);
        setIsMuted(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const newVol = Math.max(0, video.volume - 0.1);
        video.volume = newVol;
        setVolume(newVol);
      } else if (e.key === 'm' || e.key === 'M') {
        video.muted = !video.muted;
        setIsMuted(video.muted);
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleNativeFullscreen();
      } else if (e.key === 'n' || e.key === 'N') {
        if (hasNext && onNextEpisode) onNextEpisode();
      } else if (e.key === 'p' || e.key === 'P') {
        if (hasPrev && onPrevEpisode) onPrevEpisode();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showControlsTemporarily, hasNext, hasPrev, onNextEpisode, onPrevEpisode]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play(); else video.pause();
  };

  const seek = (seconds) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration || Infinity, video.currentTime + seconds));
  };

  const handleScrub = (e) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    video.currentTime = pos * duration;
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const handleVolumeChange = (e) => {
    const video = videoRef.current;
    if (!video) return;
    const val = parseFloat(e.target.value);
    video.volume = val;
    setVolume(val);
    setIsMuted(val === 0);
  };

  const toggleNativeFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;

    if (!document.fullscreenElement) {
      if (el.requestFullscreen) {
        el.requestFullscreen();
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      } else if (el.mozRequestFullScreen) {
        el.mozRequestFullScreen();
      } else if (el.msRequestFullscreen) {
        el.msRequestFullscreen();
      }
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
      setIsFullscreen(false);
    }
  };

  const changeAudioTrack = (trackId) => {
    setSelectedAudio(trackId);
    if (hlsRef.current && trackId !== -1) {
      hlsRef.current.audioTrack = trackId;
    }
    setShowSettingsMenu(false);
  };

  const changeQuality = (levelId) => {
    setSelectedQuality(levelId);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelId;
    }
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

  return (
    <div
      ref={containerRef}
      onMouseMove={showControlsTemporarily}
      className={`relative w-full aspect-video bg-black overflow-hidden select-none font-sans ${
        isFullscreen ? 'fixed inset-0 w-screen h-screen z-[99999]' : 'rounded-2xl border border-white/10 shadow-2xl'
      }`}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        playsInline
        onClick={togglePlay}
        className="w-full h-full object-contain cursor-pointer bg-black"
      />

      {/* Kaldığı Yerden Devam Bildirimi */}
      {resumeNotification && (
        <div className="absolute top-4 left-4 z-40 px-3.5 py-1.5 rounded-lg bg-black/80 backdrop-blur-md border border-white/20 text-white text-xs font-semibold flex items-center gap-2 shadow-lg animate-in fade-in slide-in-from-top duration-300">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>{resumeNotification}</span>
        </div>
      )}

      {/* Kontroller Katmanı */}
      <div
        className={`absolute inset-0 flex flex-col justify-between p-4 md:p-6 bg-gradient-to-t from-black/90 via-transparent to-black/60 transition-opacity duration-200 pointer-events-none ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Üst Bilgi */}
        <div className="flex justify-between items-center pointer-events-auto">
          <span className="text-xs font-semibold text-white/90 truncate max-w-lg">
            {title}
          </span>
          <span className="text-[11px] font-mono text-zinc-400 bg-black/50 px-2 py-0.5 rounded border border-white/10">
            HLS • 1080p
          </span>
        </div>

        {/* Alt Kontrol Araç Çubuğu */}
        <div className="flex flex-col gap-2.5 pointer-events-auto">
          {/* İlerleme Çubuğu */}
          <div
            onClick={handleScrub}
            className="relative w-full h-1.5 hover:h-2.5 bg-white/20 rounded-full cursor-pointer transition-all flex items-center"
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
            <div className="flex items-center gap-2">
              <button
                onClick={togglePlay}
                tabIndex={101}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors outline-none"
              >
                {isPlaying ? <Pause size={17} /> : <Play size={17} className="ml-0.5" />}
              </button>

              <button
                onClick={() => seek(-10)}
                tabIndex={102}
                className="p-1.5 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition-colors outline-none"
                title="10sn Geri"
              >
                <RotateCcw size={16} />
              </button>

              <button
                onClick={() => seek(10)}
                tabIndex={103}
                className="p-1.5 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition-colors outline-none"
                title="10sn İleri"
              >
                <RotateCw size={16} />
              </button>

              {hasPrev && (
                <button
                  onClick={onPrevEpisode}
                  tabIndex={104}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-white/5 hover:bg-white/15 text-xs text-zinc-300 hover:text-white transition-colors outline-none"
                >
                  <SkipBack size={13} /> Önceki
                </button>
              )}

              {hasNext && (
                <button
                  onClick={onNextEpisode}
                  tabIndex={105}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-white/5 hover:bg-white/15 text-xs text-zinc-300 hover:text-white transition-colors outline-none"
                >
                  Sonraki <SkipForward size={13} />
                </button>
              )}

              {/* Ses */}
              <div className="flex items-center gap-1.5 ml-1">
                <button
                  onClick={toggleMute}
                  tabIndex={106}
                  className="p-1.5 rounded hover:bg-white/10 text-zinc-400 hover:text-white outline-none"
                >
                  {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  tabIndex={107}
                  className="w-14 h-1 bg-white/30 rounded accent-white cursor-pointer"
                />
              </div>

              <div className="text-xs font-mono text-zinc-400 ml-1">
                <span className="text-zinc-200">{formatTime(currentTime)}</span>
                <span className="mx-1 text-zinc-600">/</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Sağ Ayarlar & Tam Ekran */}
            <div className="flex items-center gap-2 relative">
              <button
                onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                tabIndex={108}
                className={`p-1.5 rounded-lg transition-colors outline-none ${
                  showSettingsMenu ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20 text-zinc-300'
                }`}
                title="Ses Dili & Kalite"
              >
                <Sliders size={15} />
              </button>

              <button
                onClick={toggleNativeFullscreen}
                tabIndex={109}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-zinc-200 hover:text-white transition-colors outline-none"
                title={isFullscreen ? 'Tam Ekrandan Çık (ESC)' : 'Tam Ekran Yap (F)'}
              >
                {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
              </button>

              {/* Ayarlar Açılır Penceresi */}
              {showSettingsMenu && (
                <div className="absolute bottom-11 right-0 w-60 bg-[#14151e] border border-white/15 rounded-xl p-2 shadow-2xl flex flex-col gap-1 z-50">
                  {activeSettingsTab === 'main' && (
                    <>
                      <div className="px-2 py-1 text-[11px] font-semibold text-zinc-400 border-b border-white/10 pb-1">
                        Seçenekler
                      </div>

                      <button
                        onClick={() => setActiveSettingsTab('audio')}
                        tabIndex={110}
                        className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-xs font-medium text-zinc-200 text-left"
                      >
                        <div className="flex items-center gap-2">
                          <Radio size={13} />
                          <span>Ses Dili</span>
                        </div>
                        <span className="text-[11px] text-zinc-400">
                          {audioTracks[selectedAudio]?.name || 'Varsayılan'} ▶
                        </span>
                      </button>

                      <button
                        onClick={() => setActiveSettingsTab('quality')}
                        tabIndex={111}
                        className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-xs font-medium text-zinc-200 text-left"
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
