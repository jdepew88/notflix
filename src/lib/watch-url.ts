import type { MediaItem } from "./types";

export function watchIdForItem(item: MediaItem): string {
  if (item.type === "series" && item.seriesId) return item.seriesId;
  return item.id;
}

export function watchHrefForItem(item: MediaItem): string {
  return `/watch/${encodeURIComponent(watchIdForItem(item))}`;
}
