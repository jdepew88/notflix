import type { MediaItem, TmdbMediaType } from "./types";

export async function postLibraryItemAction(
  itemId: string,
  body: Record<string, unknown>
): Promise<{ item?: MediaItem; matches?: MediaItem[]; ok?: boolean }> {
  const res = await fetch(`/api/library/items/${encodeURIComponent(itemId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export async function searchLibraryItemMatches(
  itemId: string,
  query?: string
): Promise<{ item: MediaItem; matches: MediaItem[] }> {
  const params = query ? `?q=${encodeURIComponent(query)}` : "";
  const res = await fetch(`/api/library/items/${encodeURIComponent(itemId)}${params}`, {
    credentials: "same-origin",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Search failed");
  return data;
}

export function isLibraryManagedItem(item: MediaItem): boolean {
  return (
    item.source === "library" ||
    item.id.startsWith("plex-") ||
    item.id.startsWith("lib-") ||
    Boolean(item.plexRatingKey) ||
    Boolean(item.filePath)
  );
}

export async function refreshItemArtwork(itemId: string): Promise<MediaItem> {
  const data = await postLibraryItemAction(itemId, { action: "refresh-artwork" });
  if (!data.item) throw new Error("No item returned");
  return data.item;
}

export async function matchItemMetadata(
  itemId: string,
  tmdbId: number,
  mediaType: TmdbMediaType
): Promise<MediaItem> {
  const data = await postLibraryItemAction(itemId, {
    action: "match-tmdb",
    tmdbId,
    mediaType,
  });
  if (!data.item) throw new Error("No item returned");
  return data.item;
}

export async function refreshItemFromPlex(itemId: string): Promise<MediaItem> {
  const data = await postLibraryItemAction(itemId, { action: "refresh-plex" });
  if (!data.item) throw new Error("No item returned");
  return data.item;
}
