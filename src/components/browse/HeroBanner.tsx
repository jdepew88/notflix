"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MediaImage } from "@/components/ui/MediaImage";
import { Play, Info, Volume2, VolumeX } from "lucide-react";
import { motion } from "framer-motion";
import { backdropUrl } from "@/lib/tmdb";
import { useDetailModal } from "@/providers/DetailModalProvider";
import type { MediaItem } from "@/lib/types";

interface HeroBannerProps {
  item: MediaItem;
}

export function HeroBanner({ item }: HeroBannerProps) {
  const { openDetail } = useDetailModal();
  const backdrop = backdropUrl(item.backdropPath);
  const watchHref = `/watch/${encodeURIComponent(item.id)}`;
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [muted, setMuted] = useState(true);
  const [showVideo, setShowVideo] = useState(false);

  const tmdbId = item.tmdbId ?? (item.id.startsWith("tmdb-") ? parseInt(item.id.replace("tmdb-", ""), 10) : null);

  useEffect(() => {
    if (!tmdbId) return;
    fetch(`/api/catalog?type=videos&id=${tmdbId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.key) {
          setTrailerKey(d.key);
          setShowVideo(true);
        }
      })
      .catch(() => {});
  }, [tmdbId]);

  return (
    <section className="relative h-[56vw] max-h-[80vh] min-h-[280px] w-full md:min-h-[400px] lg:min-h-[500px]">
      {showVideo && trailerKey ? (
        <div className="absolute inset-0 overflow-hidden">
          <iframe
            src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&mute=1&controls=0&loop=1&playlist=${trailerKey}&modestbranding=1&rel=0&showinfo=0`}
            className="pointer-events-none absolute left-1/2 top-1/2 h-[56.25vw] min-h-full min-w-full w-[177.78vh] -translate-x-1/2 -translate-y-1/2"
            allow="autoplay; encrypted-media"
            title={item.title}
          />
        </div>
      ) : backdrop ? (
        <MediaImage
          src={backdrop}
          alt={item.title}
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

      {trailerKey && (
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
          {item.title}
        </h1>
        {item.overview && (
          <p className="mb-4 line-clamp-3 max-w-lg text-sm md:text-base lg:text-lg">
            {item.overview}
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
            onClick={() => openDetail(item)}
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
