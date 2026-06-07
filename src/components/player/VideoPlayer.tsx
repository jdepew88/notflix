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
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useCast } from "@/hooks/useCast";
import {
  buildRemotePlaybackUrl,
  isHlsSource,
  isSafariBrowser,
} from "@/lib/cast-media";
import { TrackSelector } from "./TrackSelector";
import type { StreamTrack } from "@/types/media-tracks";

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
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [airPlayReady, setAirPlayReady] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);

  const isHls = isHlsSource(src);
  const useNativeHls =
    isHls &&
    (isSafariBrowser() ||
      (typeof document !== "undefined" &&
        document.createElement("video").canPlayType("application/vnd.apple.mpegurl") !== ""));

  const playbackSrc = buildRemotePlaybackUrl(src, { plexToken });

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

  useEffect(() => {
    setPlaybackError(null);
  }, [src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isHls && !useNativeHls && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
      hls.loadSource(playbackSrc);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (hls.subtitleTracks.length > 0) {
          hls.subtitleDisplay = subtitleIndex !== null;
          if (subtitleIndex !== null) {
            const idx = hls.subtitleTracks.findIndex(
              (t) => t.id === subtitleIndex
            );
            if (idx >= 0) hls.subtitleTrack = idx;
          }
        }
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

    video.src = playbackSrc;
    return () => {
      video.removeAttribute("src");
      video.load();
    };
  }, [playbackSrc, isHls, useNativeHls, subtitleIndex]);

  useEffect(() => {
    const hls = hlsRef.current;
    if (!hls || !hls.subtitleTracks.length) return;
    hls.subtitleDisplay = subtitleIndex !== null;
    if (subtitleIndex === null) {
      hls.subtitleTrack = -1;
    }
  }, [subtitleIndex]);

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
  }, [initialProgress]);

  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (playing) setShowControls(false);
    }, 3000);
  }, [playing]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setPlaying(true);
    } else {
      video.pause();
      setPlaying(false);
    }
    resetHideTimer();
  };

  const toggleFullscreen = async () => {
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      await container.requestFullscreen();
      setFullscreen(true);
    } else {
      await document.exitFullscreen();
      setFullscreen(false);
    }
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

  const handleAirPlay = async () => {
    setRemoteError(null);
    const video = videoRef.current as HTMLVideoElement & {
      webkitShowPlaybackTargetPicker?: () => void;
      webkitCurrentPlaybackTargetIsWireless?: boolean;
    };
    if (!video) return;

    if (typeof video.webkitShowPlaybackTargetPicker !== "function") {
      setRemoteError("AirPlay is available in Safari on Apple devices.");
      return;
    }

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
    const video = videoRef.current as HTMLVideoElement & {
      webkitShowPlaybackTargetPicker?: () => void;
    };
    setAirPlayReady(typeof video?.webkitShowPlaybackTargetPicker === "function");
  }, [src]);

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full bg-black"
      onMouseMove={resetHideTimer}
      onTouchStart={resetHideTimer}
    >
      <video
        ref={videoRef}
        className="h-full w-full"
        poster={poster}
        playsInline
        disableRemotePlayback={false}
        // AirPlay 2 support (Safari / iOS / macOS)
        {...({ "x-webkit-airplay": "allow", airplay: "allow" } as React.VideoHTMLAttributes<HTMLVideoElement>)}
        onClick={togglePlay}
        onWaiting={() => setBuffering(true)}
        onCanPlay={() => setBuffering(false)}
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
      />

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

      {buffering && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/30 border-t-white" />
        </div>
      )}

      <div
        className={cn(
          "absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 via-transparent to-black/40 transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        <div className="px-4 pb-2 pt-16 md:px-8">
          <h2 className="mb-4 text-lg font-semibold md:text-xl">{title}</h2>

          {/* Progress bar */}
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
              <button type="button" onClick={togglePlay} className="text-white hover:text-netflix-light-gray">
                {playing ? <Pause className="h-7 w-7 md:h-8 md:w-8" /> : <Play className="h-7 w-7 fill-current md:h-8 md:w-8" />}
              </button>
              <button type="button" onClick={() => skip(-10)} className="hidden text-white hover:text-netflix-light-gray sm:block">
                <SkipBack className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => skip(10)} className="hidden text-white hover:text-netflix-light-gray sm:block">
                <SkipForward className="h-5 w-5" />
              </button>
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
              {(audioTracks.length > 1 || subtitleTracks.length > 0) &&
                onAudioChange &&
                onSubtitleChange &&
                !isDirectPlay && (
                <TrackSelector
                  audioTracks={audioTracks}
                  subtitleTracks={subtitleTracks}
                  audioIndex={audioIndex}
                  subtitleIndex={subtitleIndex}
                  onAudioChange={onAudioChange}
                  onSubtitleChange={onSubtitleChange}
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

              {airPlayReady && (
              <button
                type="button"
                onClick={handleAirPlay}
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

              <button type="button" onClick={toggleFullscreen} className="text-white hover:text-netflix-light-gray">
                {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
              </button>
            </div>
          </div>
          {(castError || remoteError) && (
            <p className="mt-2 text-xs text-yellow-300">
              {castError || remoteError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
