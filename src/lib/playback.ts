import type { MediaItem } from "./types";

export function canPlayItem(item: MediaItem): boolean {
  return (
    item.source === "library" ||
    item.source === "debrid" ||
    item.source === "tmdb" ||
    !!item.plexRatingKey ||
    !!item.streamUrl ||
    !!item.filePath ||
    !!item.tmdbId ||
    item.id.startsWith("plex-") ||
    item.id.startsWith("lib-") ||
    item.id.startsWith("debrid-") ||
    item.id.startsWith("tmdb-")
  );
}

export function watchHref(item: MediaItem): string {
  return `/watch/${encodeURIComponent(item.id)}`;
}
