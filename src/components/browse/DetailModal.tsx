"use client";

import { useEffect, useRef, useState } from "react";
import { MediaImage } from "@/components/ui/MediaImage";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { X, Play, Plus, ThumbsUp, Volume2, VolumeX, Check } from "lucide-react";
import { useDetailModal } from "@/providers/DetailModalProvider";
import { useAppStore } from "@/lib/store";
import { backdropUrl, posterUrl } from "@/lib/tmdb";
import { TitleCard } from "./TitleCard";
import type { MediaItem } from "@/lib/types";

export function DetailModal() {
  const { open, item, closeDetail } = useDetailModal();
  const myList = useAppStore((s) => s.myList);
  const addToMyList = useAppStore((s) => s.addToMyList);
  const removeFromMyList = useAppStore((s) => s.removeFromMyList);
  const [details, setDetails] = useState<MediaItem | null>(null);
  const [similar, setSimilar] = useState<MediaItem[]>([]);
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [muted, setMuted] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!open || !item) {
      setDetails(null);
      setSimilar([]);
      setTrailerKey(null);
      return;
    }

    async function load() {
      if (!item) return;
      const tmdbId =
        item.tmdbId ??
        (item.id.startsWith("tmdb-") ? parseInt(item.id.replace("tmdb-", ""), 10) : null);

      if (tmdbId) {
        const [detailRes, similarRes, videoRes] = await Promise.all([
          fetch(`/api/catalog?type=details&id=${tmdbId}`),
          fetch(`/api/catalog?type=similar&id=${tmdbId}`),
          fetch(`/api/catalog?type=videos&id=${tmdbId}`),
        ]);

        if (detailRes.ok) {
          const data = await detailRes.json();
          setDetails(data.item);
        }
        if (similarRes.ok) {
          const data = await similarRes.json();
          setSimilar(data.items ?? []);
        }
        if (videoRes.ok) {
          const data = await videoRes.json();
          setTrailerKey(data.key);
        }
      } else {
        setDetails(item);
      }
    }

    load();
  }, [open, item]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const display = details ?? item;
  if (!display) return null;

  const backdrop = backdropUrl(display.backdropPath);
  const inList = myList.includes(display.id);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] overflow-y-auto bg-black/80"
          onClick={closeDetail}
        >
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            transition={{ type: "spring", damping: 25 }}
            className="relative mx-auto my-8 max-w-4xl bg-[#181818] shadow-2xl md:my-16"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative aspect-video w-full bg-zinc-900">
              {trailerKey ? (
                <iframe
                  ref={iframeRef}
                  src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&mute=${muted ? 1 : 0}&controls=0&loop=1&playlist=${trailerKey}&modestbranding=1&rel=0`}
                  className="absolute inset-0 h-full w-full"
                  allow="autoplay; encrypted-media"
                  title={display.title}
                />
              ) : backdrop ? (
                <MediaImage src={backdrop} alt={display.title} fill className="object-cover" sizes="896px" />
              ) : (
                <div className="flex h-full items-center justify-center text-xl">{display.title}</div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#181818] via-transparent to-black/30" />

              <button
                type="button"
                onClick={closeDetail}
                className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-[#181818] hover:bg-netflix-red"
              >
                <X className="h-5 w-5" />
              </button>

              {trailerKey && (
                <button
                  type="button"
                  onClick={() => setMuted(!muted)}
                  className="absolute bottom-4 right-4 flex h-9 w-9 items-center justify-center rounded-full border border-white/50 bg-black/50"
                >
                  {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
              )}

              <div className="absolute bottom-6 left-6 right-6">
                <h2 className="mb-4 text-2xl font-bold md:text-4xl">{display.title}</h2>
                <div className="flex flex-wrap gap-3">
                  <Link
                    href={`/watch/${encodeURIComponent(display.id)}`}
                    className="flex items-center gap-2 rounded bg-white px-6 py-2 font-semibold text-black hover:bg-white/80"
                  >
                    <Play className="h-5 w-5 fill-current" />
                    Play
                  </Link>
                  <button
                    type="button"
                    onClick={() =>
                      inList ? removeFromMyList(display.id) : addToMyList(display.id)
                    }
                    className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/50 hover:border-white"
                  >
                    {inList ? <Check className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                  </button>
                  <button
                    type="button"
                    className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/50 hover:border-white"
                  >
                    <ThumbsUp className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="grid gap-6 p-6 md:grid-cols-[2fr_1fr]">
              <div>
                <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-semibold text-green-400">
                    {Math.min(99, Math.round((display.rating ?? 7) * 10))}% Match
                  </span>
                  {display.releaseDate && <span>{display.releaseDate.slice(0, 4)}</span>}
                  {display.runtime && (
                    <span className="border border-white/40 px-1 text-xs">{display.runtime}m</span>
                  )}
                  <span className="rounded border border-white/40 px-1 text-xs">HD</span>
                </div>
                {display.overview && (
                  <p className="text-sm leading-relaxed text-white md:text-base">{display.overview}</p>
                )}
              </div>
              <div className="space-y-2 text-sm text-netflix-light-gray">
                {display.genres && display.genres.length > 0 && (
                  <p>
                    <span className="text-netflix-gray">Genres: </span>
                    {display.genres.join(", ")}
                  </p>
                )}
              </div>
            </div>

            {similar.length > 0 && (
              <div className="px-6 pb-6">
                <h3 className="mb-4 text-xl font-semibold">More Like This</h3>
                <div className="flex gap-2 overflow-x-auto row-scroll">
                  {similar.slice(0, 12).map((s) => (
                    <TitleCard key={s.id} item={s} className="w-[120px] md:w-[140px]" />
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
