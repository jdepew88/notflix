"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MediaImage } from "@/components/ui/MediaImage";
import { Play, Info, Volume2, VolumeX, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";
import { backdropUrl } from "@/lib/tmdb";
import { watchHrefForItem } from "@/lib/watch-url";
import { useDetailModal } from "@/providers/DetailModalProvider";
import type { MediaItem } from "@/lib/types";

interface HeroBannerProps {
  item: MediaItem;
  videoError?: string | null;
  onHeroItemChange?: (item: MediaItem, error: string | null) => void;
}

const HERO_POLL_MS = 2000;
const HERO_POLL_ATTEMPTS = 45;
const HERO_STALL_MS = 4000;

interface HeroStatusResponse {
  featuredId?: string;
  primaryId?: string;
  videoReady?: boolean;
  generating?: boolean;
  exhausted?: boolean;
  error?: string | null;
  item?: MediaItem | null;
  videoUrl?: string | null;
}

export function HeroBanner({ item: initialItem, videoError, onHeroItemChange }: HeroBannerProps) {
  const { openDetail } = useDetailModal();
  const [heroItem, setHeroItem] = useState(initialItem);
  const [heroError, setHeroError] = useState<string | null>(videoError ?? null);
  const backdrop = backdropUrl(heroItem.backdropPath);
  const watchHref = watchHrefForItem(heroItem);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [localVideoUrl, setLocalVideoUrl] = useState<string | null>(null);
  const [videoMode, setVideoMode] = useState<"local" | "youtube" | null>(null);
  const [muted, setMuted] = useState(true);
  const [showVideo, setShowVideo] = useState(false);
  const videoDisabledRef = useRef(false);

  const tmdbId =
    heroItem.tmdbId ??
    (heroItem.id.startsWith("tmdb-") ? parseInt(heroItem.id.replace("tmdb-", ""), 10) : null);

  const isLibraryHero =
    heroItem.source === "library" ||
    heroItem.id.startsWith("plex-") ||
    Boolean(heroItem.plexPartKey);

  useEffect(() => {
    setHeroItem(initialItem);
    setHeroError(videoError ?? null);
  }, [initialItem, videoError]);

  const revertToPhoto = useCallback(() => {
    videoDisabledRef.current = true;
    setLocalVideoUrl(null);
    setShowVideo(false);
    setVideoMode(null);
    setTrailerKey(null);
  }, []);

  const applyStatus = useCallback(
    (data: HeroStatusResponse) => {
      if (data.item) {
        setHeroItem(data.item);
        onHeroItemChange?.(data.item, data.error ?? null);
      }
      if (data.error) {
        setHeroError(data.error);
      } else if (data.videoReady) {
        setHeroError(null);
      }
      if (videoDisabledRef.current) return false;
      if (data.videoReady && data.videoUrl) {
        setLocalVideoUrl(data.videoUrl);
        setVideoMode("local");
        setShowVideo(true);
        return true;
      }
      return false;
    },
    [onHeroItemChange]
  );

  useEffect(() => {
    let cancelled = false;
    videoDisabledRef.current = false;

    async function loadTrailer() {
      if (!tmdbId || cancelled || videoDisabledRef.current) return;
      const res = await fetch(`/api/catalog?type=videos&id=${tmdbId}`).catch(() => null);
      if (cancelled || !res?.ok || videoDisabledRef.current) return;
      const data = await res.json().catch(() => null);
      if (data?.key) {
        setTrailerKey(data.key);
        setVideoMode("youtube");
        setShowVideo(true);
      }
    }

    async function pollHeroStatus(): Promise<boolean> {
      for (let attempt = 0; attempt < HERO_POLL_ATTEMPTS; attempt++) {
        if (cancelled || videoDisabledRef.current) return false;
        const resolve = attempt === 0 ? "?resolve=1" : "";
        const res = await fetch(`/api/hero/status${resolve}`).catch(() => null);
        if (cancelled || !res?.ok) {
          await new Promise((r) => setTimeout(r, HERO_POLL_MS));
          continue;
        }
        const data = (await res.json()) as HeroStatusResponse;
        if (applyStatus(data)) return true;
        if (data.exhausted) {
          setHeroError(data.error ?? "Marquee video unavailable");
          revertToPhoto();
          return false;
        }
        await new Promise((r) => setTimeout(r, HERO_POLL_MS));
      }
      return false;
    }

    async function loadHeroVideo() {
      if (isLibraryHero) {
        const ready = await pollHeroStatus();
        if (ready || cancelled || videoDisabledRef.current) return;
        if (!heroError) {
          await loadTrailer();
        }
        return;
      }
      await loadTrailer();
    }

    setLocalVideoUrl(null);
    setTrailerKey(null);
    setVideoMode(null);
    setShowVideo(false);

    void loadHeroVideo();

    return () => {
      cancelled = true;
    };
  }, [heroItem.id, tmdbId, isLibraryHero, applyStatus, heroError, revertToPhoto]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = muted;
    }
  }, [muted, localVideoUrl]);

  useEffect(() => {
    if (!showVideo || videoMode !== "local" || !localVideoUrl) return;
    const video = videoRef.current;
    if (!video) return;

    let lastTime = video.currentTime;
    let lastAdvance = Date.now();

    const timer = window.setInterval(() => {
      if (video.paused || video.ended) return;
      if (video.currentTime > lastTime + 0.05) {
        lastTime = video.currentTime;
        lastAdvance = Date.now();
        return;
      }
      if (Date.now() - lastAdvance >= HERO_STALL_MS) {
        revertToPhoto();
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [showVideo, videoMode, localVideoUrl, revertToPhoto]);

  const handleVideoError = () => {
    revertToPhoto();
  };

  const hasVideo = showVideo && (videoMode === "local" ? Boolean(localVideoUrl) : Boolean(trailerKey));

  return (
    <section className="relative h-[56vw] max-h-[80vh] min-h-[280px] w-full md:min-h-[400px] lg:min-h-[500px]">
      {hasVideo && videoMode === "local" && localVideoUrl ? (
        <div className="absolute inset-0 overflow-hidden">
          <video
            ref={videoRef}
            src={localVideoUrl}
            autoPlay
            muted
            playsInline
            className="pointer-events-none absolute left-1/2 top-1/2 h-[56.25vw] min-h-full min-w-full w-[177.78vh] -translate-x-1/2 -translate-y-1/2 object-cover"
            onError={handleVideoError}
          />
        </div>
      ) : hasVideo && videoMode === "youtube" && trailerKey ? (
        <div className="absolute inset-0 overflow-hidden">
          <iframe
            src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&mute=${muted ? 1 : 0}&controls=0&loop=1&playlist=${trailerKey}&modestbranding=1&rel=0&showinfo=0`}
            className="pointer-events-none absolute left-1/2 top-1/2 h-[56.25vw] min-h-full min-w-full w-[177.78vh] -translate-x-1/2 -translate-y-1/2"
            allow="autoplay; encrypted-media"
            title={heroItem.title}
          />
        </div>
      ) : backdrop ? (
        <MediaImage
          src={backdrop}
          alt={heroItem.title}
          fill
          priority
          className="object-cover object-top"
          sizes="100vw"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-zinc-800 to-black" />
      )}

      <div className="netflix-gradient-hero absolute inset-0" />
      <div className="netflix-gradient-bottom absolute inset-x-0 bottom-0 h-32" />

      {heroError && (
        <div className="absolute left-4 right-4 top-4 z-20 flex items-start gap-2 rounded-md border border-yellow-500/40 bg-black/70 px-3 py-2 text-sm text-yellow-100 backdrop-blur md:left-12 md:max-w-xl">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-400" />
          <span>{heroError}</span>
        </div>
      )}

      {hasVideo && (
        <button
          type="button"
          onClick={() => setMuted(!muted)}
          className="absolute bottom-[35%] right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-white/40 bg-black/40 backdrop-blur md:right-12"
        >
          {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="absolute bottom-[20%] left-4 z-10 max-w-xl md:left-12 md:max-w-2xl lg:left-16 lg:max-w-3xl"
      >
        <h1 className="mb-3 text-3xl font-bold drop-shadow-lg md:text-5xl lg:text-6xl">
          {heroItem.title}
        </h1>
        {heroItem.overview && (
          <p className="mb-4 line-clamp-3 max-w-lg text-sm md:text-base lg:text-lg">
            {heroItem.overview}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Link
            href={watchHref}
            className="flex items-center gap-2 rounded bg-white px-6 py-2 text-sm font-semibold text-black transition hover:bg-white/80 md:px-8 md:py-2.5 md:text-base"
          >
            <Play className="h-5 w-5 fill-current" />
            Play
          </Link>
          <button
            type="button"
            onClick={() => openDetail(heroItem)}
            className="flex items-center gap-2 rounded bg-white/30 px-6 py-2 text-sm font-semibold backdrop-blur transition hover:bg-white/20 md:px-8 md:py-2.5 md:text-base"
          >
            <Info className="h-5 w-5" />
            More Info
          </button>
        </div>
      </motion.div>
    </section>
  );
}
