"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MediaImage } from "@/components/ui/MediaImage";
import { posterUrl } from "@/lib/tmdb";
import { canPlayItem, watchHref } from "@/lib/playback";
import { WatchProviderLogos } from "@/components/browse/WatchProviderLogos";
import { usePortal } from "@/providers/PortalProvider";
import { useDetailModal } from "@/providers/DetailModalProvider";
import type { MediaItem } from "@/lib/types";
import { cn } from "@/lib/cn";

interface TitleCardWithHoverProps {
  item: MediaItem;
  className?: string;
  priority?: boolean;
  large?: boolean;
}

export function TitleCardWithHover({ item, className, priority, large }: TitleCardWithHoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { setPortal, item: portalItem } = usePortal();
  const { openDetail } = useDetailModal();
  const [isHovered, setIsHovered] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const poster = posterUrl(item.posterPath, "w342");
  const isActive = portalItem?.id === item.id;

  useEffect(() => {
    if (isHovered && ref.current) {
      hoverTimer.current = setTimeout(() => {
        setPortal(ref.current, item);
      }, 400);
    }
    return () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    };
  }, [isHovered, item, setPortal]);

  const handlePointerEnter = () => {
    if (window.matchMedia("(hover: hover)").matches) {
      setIsHovered(true);
    }
  };

  const handlePointerLeave = () => {
    setIsHovered(false);
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  };

  const handleClick = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setPortal(null, null);
    if (canPlayItem(item)) {
      router.push(watchHref(item));
    } else {
      openDetail(item);
    }
  };

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      className={cn(
        "relative shrink-0 cursor-pointer overflow-hidden rounded-sm bg-netflix-dark transition-transform duration-300",
        large
          ? "w-[160px] sm:w-[180px] md:w-[220px] lg:w-[260px]"
          : "w-[140px] sm:w-[160px] md:w-[200px] lg:w-[240px]",
        isActive && "z-30 scale-105",
        className
      )}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
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
    </div>
  );
}
