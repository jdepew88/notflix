"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  SkipBack,
  SkipForward,
  Cast,
  Airplay,
  Subtitles,
  Gauge,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useCast } from "@/hooks/useCast";
import {
  buildRemotePlaybackUrl,
  isHlsSource,
  isSafariBrowser,
} from "@/lib/cast-media";
import {
  applyHlsBufferTier,
  buildHlsConfig,
  getBufferedAhead,
  getMinPlayBufferSeconds,
  playWhenBuffered,
  qualityTierFromHeight,
  qualityTierFromHint,
  type BufferTier,
} from "@/lib/playback-buffer";
import { subtitleFileToObjectUrl } from "@/lib/external-subtitles";
import { TrackSelector } from "./TrackSelector";
import { StreamInfoModal } from "./StreamInfoModal";
import type { StreamTrack } from "@/types/media-tracks";
import type { StreamPlaybackInfo } from "@/types/stream-info";

interface VideoPlayerProps {
  src: string;
  title: string;
  poster?: string;
  initialProgress?: number;
  onProgress?: (seconds: number, percent: number) => void;
  onEnded?: () => void;
  audioTracks?: StreamTrack[];
  subtitleTracks?: StreamTrack[];
  audioIndex?: number;
  subtitleIndex?: number | null;
  onAudioChange?: (index: number) => void;
  onSubtitleChange?: (index: number | null) => void;
  onRequestTranscode?: () => void;
  transcodeAvailable?: boolean;
  isDirectPlay?: boolean;
  plexToken?: string;
  plexRatingKey?: string;
  plexUrl?: string;
  qualityHint?: string | null;
  streamInfo?: StreamPlaybackInfo;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VideoPlayer({
  src,
  title,
  poster,
  initialProgress = 0,
  onProgress,
  onEnded,
  audioTracks = [],
  subtitleTracks = [],
  audioIndex = 0,
  subtitleIndex = null,
  onAudioChange,
  onSubtitleChange,
  onRequestTranscode,
  transcodeAvailable,
  isDirectPlay,
  plexToken,
  plexRatingKey,
  plexUrl,
  qualityHint,
  streamInfo,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const hlsRef = useRef<Hls | null>(null);
  const bufferTierRef = useRef<BufferTier>(qualityTierFromHint(qualityHint));
  const autoplayAttemptedRef = useRef(false);
  const lastSubtitleRef = useRef<number | null>(null);
  const audioGraphRef = useRef<{
    ctx: AudioContext;
    delay: DelayNode;
  } | null>(null);

  const [initialBuffering, setInitialBuffering] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [videoWidth, setVideoWidth] = useState(0);
  const [videoHeight, setVideoHeight] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [showStreamInfo, setShowStreamInfo] = useState(false);
  const [showSyncPanel, setShowSyncPanel] = useState(false);
  const [audioDelayMs, setAudioDelayMs] = useState(0);
  const [externalSubUrl, setExternalSubUrl] = useState<string | null>(null);
  const [externalSubName, setExternalSubName] = useState<string | null>(null);
  const [externalSubEnabled, setExternalSubEnabled] = useState(false);

  const showAirPlay = isSafariBrowser();

  const isHls = isHlsSource(src);
  const useNativeHls =
    isHls &&
    (isSafariBrowser() ||
      (typeof document !== "undefined" &&
        document.createElement("video").canPlayType("application/vnd.apple.mpegurl") !== ""));

  const playbackSrc = buildRemotePlaybackUrl(src, { plexToken });

  const captionsOn =
    externalSubEnabled || (subtitleIndex !== null && !externalSubEnabled);

  const { castReady, casting, castError, startCast, stopCast, clearCastError } = useCast({
    title,
    src,
    poster,
    videoRef,
    plexToken,
    plexRatingKey,
    plexUrl,
    currentTime,
  });

  const ensureAudioGraph = useCallback((video: HTMLVideoElement) => {
    if (audioGraphRef.current) return audioGraphRef.current;
    const ctx = new AudioContext();
    const source = ctx.createMediaElementSource(video);
    const delay = ctx.createDelay(10.0);
    delay.delayTime.value = 0;
    source.connect(delay);
    delay.connect(ctx.destination);
    audioGraphRef.current = { ctx, delay };
    return audioGraphRef.current;
  }, []);

  const applyAudioDelay = useCallback(
    (ms: number) => {
      const video = videoRef.current;
      if (!video) return;
      setAudioDelayMs(ms);
      const graph = ensureAudioGraph(video);
      graph.delay.delayTime.value = Math.max(0, ms) / 1000;
      void graph.ctx.resume().catch(() => undefined);
    },
    [ensureAudioGraph]
  );

  const bumpAudioLater = useCallback(() => {
    applyAudioDelay(Math.min(5000, audioDelayMs + 50));
  }, [applyAudioDelay, audioDelayMs]);

  const bumpAudioEarlier = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const seekBy = 0.05;
    video.currentTime = Math.min(
      Math.max(0, (video.duration || Infinity) - 0.25),
      video.currentTime + seekBy
    );
    applyAudioDelay(Math.max(0, audioDelayMs - 50));
  }, [applyAudioDelay, audioDelayMs]);

  const resetAudioSync = useCallback(() => {
    applyAudioDelay(0);
  }, [applyAudioDelay]);

  const attemptAutoplay = useCallback(async () => {
    const video = videoRef.current;
    if (!video || autoplayAttemptedRef.current) return;
    autoplayAttemptedRef.current = true;
    setInitialBuffering(true);
    try {
      await playWhenBuffered(video, getMinPlayBufferSeconds(bufferTierRef.current));
      setPlaying(true);
    } catch {
      /* Browser may block autoplay until user interacts */
    } finally {
      setInitialBuffering(false);
    }
  }, []);

  useEffect(() => {
    bufferTierRef.current = qualityTierFromHint(qualityHint);
  }, [qualityHint, src]);

  useEffect(() => {
    setPlaybackError(null);
    autoplayAttemptedRef.current = false;
    setAudioDelayMs(0);
    if (audioGraphRef.current) {
      audioGraphRef.current.delay.delayTime.value = 0;
    }
  }, [src]);

  useEffect(() => {
    return () => {
      if (externalSubUrl) URL.revokeObjectURL(externalSubUrl);
    };
  }, [externalSubUrl]);

  useEffect(() => {
    if (subtitleIndex !== null) {
      lastSubtitleRef.current = subtitleIndex;
      if (externalSubEnabled) setExternalSubEnabled(false);
    }
  }, [subtitleIndex, externalSubEnabled]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !externalSubUrl || !externalSubEnabled) return;
    const timer = window.setTimeout(() => {
      for (const track of video.textTracks) {
        track.mode = "showing";
      }
    }, 100);
    return () => window.clearTimeout(timer);
  }, [externalSubUrl, externalSubEnabled, src]);

  const updateBufferTier = useCallback((tier: BufferTier) => {
    if (tier === bufferTierRef.current) return;
    bufferTierRef.current = tier;
    const hls = hlsRef.current;
    if (hls) applyHlsBufferTier(hls, tier);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const tier = qualityTierFromHint(qualityHint);
    bufferTierRef.current = tier;

    if (isHls && !useNativeHls && Hls.isSupported()) {
      const hls = new Hls(buildHlsConfig(tier));
      hls.loadSource(playbackSrc);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        const maxHeight = Math.max(0, ...data.levels.map((level) => level.height || 0));
        if (maxHeight > 0) {
          updateBufferTier(qualityTierFromHeight(maxHeight));
        }
        if (hls.subtitleTracks.length > 0 && !externalSubEnabled) {
          hls.subtitleDisplay = subtitleIndex !== null;
          if (subtitleIndex !== null) {
            const byStreamId = hls.subtitleTracks.findIndex((t) => t.id === subtitleIndex);
            const englishIdx = hls.subtitleTracks.findIndex((t) =>
              /en|english/i.test(t.name || t.lang || "")
            );
            const idx =
              byStreamId >= 0 ? byStreamId : englishIdx >= 0 ? englishIdx : 0;
            hls.subtitleTrack = idx;
          }
        }
        void attemptAutoplay();
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setPlaybackError(
            "Playback failed. Plex may need transcoding enabled — check server settings."
          );
        }
      });
      hlsRef.current = hls;
      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }

    video.preload = "auto";
    video.src = playbackSrc;
    const onReady = () => void attemptAutoplay();
    video.addEventListener("loadeddata", onReady, { once: true });
    return () => {
      video.removeEventListener("loadeddata", onReady);
      video.removeAttribute("src");
      video.load();
    };
  }, [
    playbackSrc,
    isHls,
    useNativeHls,
    subtitleIndex,
    qualityHint,
    updateBufferTier,
    attemptAutoplay,
    externalSubEnabled,
  ]);

  useEffect(() => {
    const hls = hlsRef.current;
    if (!hls || !hls.subtitleTracks.length || externalSubEnabled) return;
    hls.subtitleDisplay = subtitleIndex !== null;
    if (subtitleIndex === null) {
      hls.subtitleTrack = -1;
      return;
    }
    const byStreamId = hls.subtitleTracks.findIndex((t) => t.id === subtitleIndex);
    const englishIdx = hls.subtitleTracks.findIndex((t) =>
      /en|english/i.test(t.name || t.lang || "")
    );
    hls.subtitleTrack = byStreamId >= 0 ? byStreamId : englishIdx >= 0 ? englishIdx : 0;
  }, [subtitleIndex, externalSubEnabled]);

  useEffect(() => {
    const hls = hlsRef.current;
    if (hls) hls.subtitleDisplay = externalSubEnabled ? false : subtitleIndex !== null;
  }, [externalSubEnabled, subtitleIndex]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || initialProgress <= 0) return;
    const setStart = () => {
      if (video.duration && initialProgress > 0) {
        video.currentTime = (initialProgress / 100) * video.duration;
      }
    };
    video.addEventListener("loadedmetadata", setStart);
    return () => video.removeEventListener("loadedmetadata", setStart);
  }, [initialProgress, src]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    document.addEventListener("click", closeMenu);
    return () => document.removeEventListener("click", closeMenu);
  }, []);

  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (playing) setShowControls(false);
    }, 3000);
  }, [playing]);

  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      setInitialBuffering(true);
      try {
        await playWhenBuffered(video, getMinPlayBufferSeconds(bufferTierRef.current));
        setPlaying(true);
      } catch {
        setPlaybackError("Playback failed to start.");
      } finally {
        setInitialBuffering(false);
      }
    } else {
      video.pause();
      setPlaying(false);
    }
    resetHideTimer();
  };

  const toggleFullscreen = async () => {
    const container = containerRef.current;
    if (!container) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await container.requestFullscreen();
      }
    } catch {
      /* browser may block fullscreen */
    }
    resetHideTimer();
  };

  const handleVideoClick = () => {
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => {
      void togglePlay();
      clickTimer.current = null;
    }, 250);
  };

  const handleVideoDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    void toggleFullscreen();
  };

  const stopClickPropagation = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    const bar = e.currentTarget;
    if (!video || !bar) return;
    const rect = bar.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    video.currentTime = pct * video.duration;
    resetHideTimer();
  };

  const skip = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
    resetHideTimer();
  };

  const toggleCaptions = () => {
    if (externalSubUrl) {
      const next = !externalSubEnabled;
      setExternalSubEnabled(next);
      if (next) onSubtitleChange?.(null);
      return;
    }
    if (subtitleIndex !== null) {
      lastSubtitleRef.current = subtitleIndex;
      onSubtitleChange?.(null);
      return;
    }
    if (lastSubtitleRef.current !== null) {
      onSubtitleChange?.(lastSubtitleRef.current);
      return;
    }
    if (subtitleTracks.length > 0) {
      onSubtitleChange?.(subtitleTracks[0].index);
    }
  };

  const handleExternalSubtitle = async (file: File) => {
    try {
      if (externalSubUrl) URL.revokeObjectURL(externalSubUrl);
      const url = await subtitleFileToObjectUrl(file);
      setExternalSubUrl(url);
      setExternalSubName(file.name);
      setExternalSubEnabled(true);
      const hls = hlsRef.current;
      if (hls) hls.subtitleDisplay = false;
    } catch (err) {
      setPlaybackError(err instanceof Error ? err.message : "Could not load subtitle file");
    }
  };

  const handleAirPlay = async () => {
    setRemoteError(null);
    const video = videoRef.current as HTMLVideoElement & {
      webkitShowPlaybackTargetPicker?: () => void;
    };
    if (!video || typeof video.webkitShowPlaybackTargetPicker !== "function") return;

    try {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
        video.src = playbackSrc;
        video.load();
        await video.play().catch(() => undefined);
      }
      video.webkitShowPlaybackTargetPicker();
    } catch {
      setRemoteError("Could not open AirPlay picker.");
    }
  };

  useEffect(() => {
    return () => {
      if (clickTimer.current) clearTimeout(clickTimer.current);
    };
  }, []);

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedAhead = videoRef.current ? getBufferedAhead(videoRef.current) : 0;

  const showTrackSelector =
    (audioTracks.length > 0 && onAudioChange) || Boolean(onSubtitleChange);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full bg-black"
      onMouseMove={resetHideTimer}
      onTouchStart={resetHideTimer}
      onContextMenu={handleContextMenu}
    >
      <div
        className="absolute inset-0"
        onClick={handleVideoClick}
        onDoubleClick={handleVideoDoubleClick}
      >
        <video
          ref={videoRef}
          className="h-full w-full"
          poster={poster}
          playsInline
          autoPlay
          disableRemotePlayback={false}
          {...({ "x-webkit-airplay": "allow", airplay: "allow" } as React.VideoHTMLAttributes<HTMLVideoElement>)}
          onWaiting={() => setBuffering(true)}
          onCanPlay={() => setBuffering(false)}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            setVideoWidth(v.videoWidth);
            setVideoHeight(v.videoHeight);
            if (v.videoHeight > 0) {
              updateBufferTier(qualityTierFromHeight(v.videoHeight));
            }
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            setCurrentTime(v.currentTime);
            setDuration(v.duration || 0);
            if (onProgress && v.duration) {
              onProgress(v.currentTime, (v.currentTime / v.duration) * 100);
            }
          }}
          onEnded={() => {
            setPlaying(false);
            onEnded?.();
          }}
          onError={() => {
            setPlaybackError(
              isDirectPlay
                ? "Direct play failed — your browser may not support this codec. Try Transcode."
                : "Playback failed. Try direct play or check server settings."
            );
          }}
        >
          {externalSubUrl && externalSubEnabled && (
            <track
              kind="subtitles"
              src={externalSubUrl}
              label={externalSubName ?? "External"}
              srcLang="en"
              default
            />
          )}
        </video>
      </div>

      {contextMenu && (
        <div
          className="fixed z-[90] min-w-[12rem] rounded-md bg-zinc-900 py-1 shadow-xl ring-1 ring-white/10"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={stopClickPropagation}
        >
          <button
            type="button"
            className="block w-full px-4 py-2 text-left text-sm hover:bg-white/10"
            onClick={() => {
              setContextMenu(null);
              setShowStreamInfo(true);
            }}
          >
            Get info about the stream
          </button>
        </div>
      )}

      {showStreamInfo && (
        <StreamInfoModal
          info={{
            streamUrl: src,
            isDirectPlay,
            qualityHint,
            ...streamInfo,
            audioTracks,
            subtitleTracks,
            audioIndex,
            subtitleIndex,
          }}
          live={{
            width: videoWidth,
            height: videoHeight,
            duration,
            currentTime,
            buffered: bufferedAhead,
            playing,
            audioSyncMs: audioDelayMs,
            externalSubtitle: externalSubEnabled ? externalSubName : null,
          }}
          onClose={() => setShowStreamInfo(false)}
        />
      )}

      {playbackError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 px-6 text-center">
          <p className="max-w-md text-red-400">{playbackError}</p>
          {transcodeAvailable && onRequestTranscode && isDirectPlay && (
            <button
              type="button"
              onClick={() => {
                setPlaybackError(null);
                onRequestTranscode();
              }}
              className="rounded bg-netflix-red px-4 py-2 text-sm font-semibold"
            >
              Switch to Transcode
            </button>
          )}
        </div>
      )}

      {(buffering || initialBuffering) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/30 border-t-white" />
          {initialBuffering && (
            <p className="text-sm text-netflix-light-gray">
              Buffering ahead for smooth playback…
            </p>
          )}
        </div>
      )}

      <div
        className={cn(
          "absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 via-transparent to-black/40 transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={stopClickPropagation}
        onDoubleClick={handleVideoDoubleClick}
      >
        <div className="px-4 pb-2 pt-16 md:px-8">
          <h2 className="mb-4 text-lg font-semibold md:text-xl">{title}</h2>

          <div
            className="group mb-3 h-1 cursor-pointer rounded bg-white/30 transition-all hover:h-1.5"
            onClick={seek}
          >
            <div
              className="relative h-full rounded bg-netflix-red"
              style={{ width: `${progressPct}%` }}
            >
              <div className="absolute -right-1.5 -top-1 h-3.5 w-3.5 scale-0 rounded-full bg-netflix-red transition group-hover:scale-100" />
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 md:gap-4">
              <button type="button" onClick={() => void togglePlay()} className="text-white hover:text-netflix-light-gray">
                {playing ? <Pause className="h-7 w-7 md:h-8 md:w-8" /> : <Play className="h-7 w-7 fill-current md:h-8 md:w-8" />}
              </button>
              <button type="button" onClick={() => skip(-10)} className="hidden text-white hover:text-netflix-light-gray sm:block">
                <SkipBack className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => skip(10)} className="hidden text-white hover:text-netflix-light-gray sm:block">
                <SkipForward className="h-5 w-5" />
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowSyncPanel((v) => !v)}
                  className={cn(
                    "text-white hover:text-netflix-light-gray",
                    audioDelayMs > 0 && "text-yellow-300"
                  )}
                  title="Audio sync"
                >
                  <Gauge className="h-5 w-5" />
                </button>
                {showSyncPanel && (
                  <div className="absolute bottom-full left-0 mb-2 w-56 rounded bg-black/95 p-3 text-sm shadow-xl ring-1 ring-white/10">
                    <p className="mb-2 text-xs text-netflix-gray">Sync audio with video</p>
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={bumpAudioEarlier}
                        className="rounded bg-white/10 px-2 py-1 hover:bg-white/20"
                      >
                        −50ms
                      </button>
                      <span className="font-mono text-xs">{audioDelayMs}ms delay</span>
                      <button
                        type="button"
                        onClick={bumpAudioLater}
                        className="rounded bg-white/10 px-2 py-1 hover:bg-white/20"
                      >
                        +50ms
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={resetAudioSync}
                      className="mt-2 w-full rounded bg-white/10 py-1 text-xs hover:bg-white/20"
                    >
                      Reset sync
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const v = videoRef.current;
                    if (!v) return;
                    v.muted = !v.muted;
                    setMuted(v.muted);
                  }}
                >
                  {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setVolume(val);
                    if (videoRef.current) {
                      videoRef.current.volume = val;
                      videoRef.current.muted = val === 0;
                      setMuted(val === 0);
                    }
                  }}
                  className="hidden w-20 accent-netflix-red sm:block"
                />
              </div>
              <span className="text-xs text-netflix-light-gray md:text-sm">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {(onSubtitleChange || subtitleTracks.length > 0 || externalSubUrl) && (
                <button
                  type="button"
                  onClick={toggleCaptions}
                  className={cn(
                    "text-white hover:text-netflix-light-gray",
                    captionsOn && "text-netflix-red"
                  )}
                  title={captionsOn ? "Turn off captions" : "Turn on captions"}
                >
                  <Subtitles className="h-5 w-5" />
                </button>
              )}

              {showTrackSelector && (
                <TrackSelector
                  audioTracks={audioTracks}
                  subtitleTracks={subtitleTracks}
                  audioIndex={audioIndex}
                  subtitleIndex={externalSubEnabled ? null : subtitleIndex}
                  onAudioChange={onAudioChange ?? (() => undefined)}
                  onSubtitleChange={onSubtitleChange ?? (() => undefined)}
                  onExternalSubtitle={handleExternalSubtitle}
                  externalSubtitleName={externalSubEnabled ? externalSubName : null}
                />
              )}

              {transcodeAvailable && onRequestTranscode && isDirectPlay && (
                <button
                  type="button"
                  onClick={onRequestTranscode}
                  className="text-xs text-netflix-light-gray hover:text-white"
                  title="Transcode for unsupported codecs or audio/subtitle selection"
                >
                  Transcode
                </button>
              )}

              {showAirPlay && (
                <button
                  type="button"
                  onClick={() => void handleAirPlay()}
                  className="text-white hover:text-netflix-light-gray"
                  title="AirPlay"
                >
                  <Airplay className="h-5 w-5" />
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  clearCastError();
                  if (casting) stopCast();
                  else void startCast();
                }}
                disabled={!castReady}
                className={cn(
                  "text-white hover:text-netflix-light-gray disabled:opacity-40",
                  casting && "text-netflix-red"
                )}
                title={castReady ? "Cast to Chromecast" : "Chromecast loading…"}
              >
                <Cast className="h-5 w-5" />
              </button>

              <button type="button" onClick={() => void toggleFullscreen()} className="text-white hover:text-netflix-light-gray">
                {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
              </button>
            </div>
          </div>
          {(castError || remoteError) && (
            <p className="mt-2 text-xs text-yellow-300">{castError || remoteError}</p>
          )}
        </div>
      </div>
    </div>
  );
}
