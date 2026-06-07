"use client";

import { useEffect, useRef, useState } from "react";
import { MediaImage } from "@/components/ui/MediaImage";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Plus, ThumbsUp, ChevronDown, Check } from "lucide-react";
import { createPortal } from "react-dom";
import { usePortal } from "@/providers/PortalProvider";
import { useDetailModal } from "@/providers/DetailModalProvider";
import { useAppStore, isInMyList } from "@/lib/store";
import { posterUrl, backdropUrl } from "@/lib/tmdb";
import { cn } from "@/lib/cn";

function formatRuntime(minutes?: number): string {
  if (!minutes) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function matchScore(rating?: number): number {
  if (!rating) return Math.floor(70 + Math.random() * 25);
  return Math.min(99, Math.round(rating * 10));
}

export function TitleCardPortal() {
  const { anchorElement, item, setPortal } = usePortal();
  const { openDetail } = useDetailModal();
  const router = useRouter();
  const addToMyList = useAppStore((s) => s.addToMyList);
  const removeFromMyList = useAppStore((s) => s.removeFromMyList);
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!item) return;
    const handleScroll = () => setPortal(null, null);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [item, setPortal]);

  if (!mounted || !anchorElement || !item) return null;

  const rect = anchorElement.getBoundingClientRect();
  const cardWidth = Math.min(rect.width * 1.5, 360);
  const left = Math.min(
    Math.max(8, rect.left - (cardWidth - rect.width) / 2),
    window.innerWidth - cardWidth - 8
  );
  const top = rect.top + window.scrollY - 20;

  const poster = posterUrl(item.posterPath, "w500");
  const backdrop = backdropUrl(item.backdropPath);
  const inList = isInMyList(item.id);
  const score = matchScore(item.rating);

  return createPortal(
    <AnimatePresence>
      <motion.div
        ref={containerRef}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.2 }}
        className="pointer-events-auto fixed z-[100] overflow-hidden rounded-md bg-[#181818] shadow-2xl ring-1 ring-white/10"
        style={{
          width: cardWidth,
          left,
          top,
        }}
        onPointerLeave={() => setPortal(null, null)}
      >
        <div className="relative aspect-video w-full bg-zinc-900">
          {backdrop || poster ? (
            <MediaImage
              src={backdrop || poster!}
              alt={item.title}
              fill
              className="object-cover"
              sizes={`${cardWidth}px`}
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-zinc-800 p-4 text-center text-sm">
              {item.title}
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#181818] via-transparent to-transparent" />
        </div>

        <div className="p-3">
          <div className="mb-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push(`/watch/${encodeURIComponent(item.id)}`)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black hover:bg-white/80"
            >
              <Play className="h-4 w-4 fill-current" />
            </button>
            <button
              type="button"
              onClick={() => (inList ? removeFromMyList(item.id) : addToMyList(item.id))}
              className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white/50 hover:border-white"
            >
              {inList ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            </button>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white/50 hover:border-white"
            >
              <ThumbsUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setPortal(null, null);
                openDetail(item);
              }}
              className="ml-auto flex h-8 w-8 items-center justify-center rounded-full border-2 border-white/50 hover:border-white"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>

          <p className="mb-1 text-sm font-semibold text-green-400">
            {score}% Match
          </p>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-netflix-light-gray">
            {item.releaseDate && (
              <span className="border border-white/40 px-1">{item.releaseDate.slice(0, 4)}</span>
            )}
            {item.runtime && <span>{formatRuntime(item.runtime)}</span>}
            <span className="rounded border border-white/40 px-1 text-[10px]">HD</span>
          </div>
          {item.genres && item.genres.length > 0 && (
            <p className="line-clamp-1 text-xs text-netflix-light-gray">
              {item.genres.join(" · ")}
            </p>
          )}
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
