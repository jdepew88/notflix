"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { MediaImage } from "@/components/ui/MediaImage";
import { Play, Plus, Info } from "lucide-react";
import { posterUrl } from "@/lib/tmdb";
import { canPlayItem, watchHref } from "@/lib/playback";
import { WatchProviderLogos } from "@/components/browse/WatchProviderLogos";
import type { MediaItem } from "@/lib/types";
import { cn } from "@/lib/cn";

interface TitleCardProps {
  item: MediaItem;
  className?: string;
  priority?: boolean;
}

export function TitleCard({ item, className, priority }: TitleCardProps) {
  const router = useRouter();
  const poster = posterUrl(item.posterPath, "w342");
  const href = canPlayItem(item) ? watchHref(item) : `/browse/title/${encodeURIComponent(item.id)}`;

  const handleClick = (e: React.MouseEvent) => {
    if (canPlayItem(item)) {
      e.preventDefault();
      router.push(watchHref(item));
    }
  };

  return (
    <Link
      href={href}
      onClick={handleClick}
      className={cn(
        "title-card-hover relative block shrink-0 overflow-hidden rounded-sm bg-netflix-dark",
        "w-[140px] sm:w-[160px] md:w-[200px] lg:w-[240px]",
        className
      )}
    >
      <div className="relative aspect-[2/3] w-full">
        {poster ? (
          <MediaImage
            src={poster}
            alt={item.title}
            fill
            sizes="(max-width: 640px) 140px, (max-width: 768px) 160px, (max-width: 1024px) 200px, 240px"
            className="object-cover"
            priority={priority}
          />
        ) : (
          <div className="flex h-full w-full items-end bg-gradient-to-br from-zinc-800 to-zinc-900 p-3">
            <span className="line-clamp-3 text-sm font-medium">{item.title}</span>
          </div>
        )}
        {item.progress !== undefined && item.progress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/30">
            <div
              className="h-full bg-netflix-red"
              style={{ width: `${Math.min(item.progress, 100)}%` }}
            />
          </div>
        )}
        {(item.watchProviders || item.tmdbId) && (
          <div
            className={cn(
              "absolute left-0 right-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2 pb-2 pt-8",
              item.progress !== undefined && item.progress > 0 ? "bottom-1" : "bottom-0"
            )}
          >
            <WatchProviderLogos item={item} />
          </div>
        )}
      </div>
    </Link>
  );
}

interface TitleCardExpandedProps {
  item: MediaItem;
}

export function TitleCardExpanded({ item }: TitleCardExpandedProps) {
  const poster = posterUrl(item.posterPath, "w342");
  const href = `/browse/title/${encodeURIComponent(item.id)}`;

  return (
    <Link
      href={href}
      className="group relative block shrink-0 overflow-hidden rounded-md bg-netflix-dark transition-transform duration-300 hover:scale-105 hover:z-10 w-[240px] md:w-[300px] lg:w-[360px]"
    >
      <div className="relative aspect-video w-full">
        {poster ? (
          <MediaImage src={poster} alt={item.title} fill className="object-cover" sizes="360px" />
        ) : (
          <div className="flex h-full items-center justify-center bg-zinc-800 p-4 text-center">
            {item.title}
          </div>
        )}
        <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/90 via-transparent to-transparent p-4 opacity-0 transition group-hover:opacity-100">
          <div>
            <h3 className="font-semibold">{item.title}</h3>
            <div className="mt-2 flex gap-2">
              <span className="rounded-full bg-white p-1.5 text-black">
                <Play className="h-4 w-4 fill-current" />
              </span>
              <span className="rounded-full border border-white/50 p-1.5">
                <Plus className="h-4 w-4" />
              </span>
              <span className="rounded-full border border-white/50 p-1.5">
                <Info className="h-4 w-4" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
