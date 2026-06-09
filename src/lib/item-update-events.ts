import type { MediaItem } from "./types";

export const LIBRARY_ITEM_UPDATED = "library-item-updated";

export function dispatchLibraryItemUpdated(item: MediaItem): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(LIBRARY_ITEM_UPDATED, { detail: item }));
}

export function onLibraryItemUpdated(
  handler: (item: MediaItem) => void
): () => void {
  if (typeof window === "undefined") return () => undefined;

  const listener = (event: Event) => {
    const custom = event as CustomEvent<MediaItem>;
    if (custom.detail) handler(custom.detail);
  };

  window.addEventListener(LIBRARY_ITEM_UPDATED, listener);
  return () => window.removeEventListener(LIBRARY_ITEM_UPDATED, listener);
}
