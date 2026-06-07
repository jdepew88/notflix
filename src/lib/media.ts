import { fetchWithSettings, getClientSettings } from "./client-settings";
import type { MediaItem } from "./types";

let libraryCache: MediaItem[] | null = null;
let libraryCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

export async function fetchLibraryItems(): Promise<MediaItem[]> {
  if (libraryCache && Date.now() - libraryCacheTime < CACHE_TTL) {
    return libraryCache;
  }
  try {
    const res = await fetchWithSettings(`${getBaseUrl()}/api/library`, getClientSettings(), {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    libraryCache = data.items ?? [];
    libraryCacheTime = Date.now();
    return libraryCache ?? [];
  } catch {
    return [];
  }
}

export async function fetchCatalog(type: string): Promise<MediaItem[]> {
  try {
    const res = await fetch(`${getBaseUrl()}/api/catalog?type=${type}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.items ?? [];
  } catch {
    return [];
  }
}

export async function searchCatalog(query: string): Promise<MediaItem[]> {
  try {
    const res = await fetch(
      `${getBaseUrl()}/api/catalog?type=search&q=${encodeURIComponent(query)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.items ?? [];
  } catch {
    return [];
  }
}

export async function resolveMedia(id: string): Promise<MediaItem | null> {
  const decoded = decodeURIComponent(id);

  if (decoded.startsWith("lib-")) {
    const items = await fetchLibraryItems();
    return items.find((i) => i.id === decoded) ?? null;
  }

  if (decoded.startsWith("debrid-")) {
    const torrentId = decoded.replace("debrid-", "");
    return {
      id: decoded,
      title: "Debrid Stream",
      type: "movie",
      source: "debrid",
      debridId: torrentId,
    };
  }

  if (decoded.startsWith("tmdb-")) {
    const items = await fetchCatalog("trending");
    const found = items.find((i) => i.id === decoded);
    if (found) return found;
    const popular = await fetchCatalog("popular");
    return popular.find((i) => i.id === decoded) ?? {
      id: decoded,
      title: decoded.replace("tmdb-", "Title "),
      type: "movie",
      source: "tmdb",
    };
  }

  return null;
}

export function getStreamUrl(item: MediaItem, debridStreamUrl?: string): string | null {
  if (item.source === "library" && item.filePath) {
    return `/api/library/stream?path=${encodeURIComponent(item.filePath)}`;
  }
  if (item.source === "debrid" && debridStreamUrl) {
    return debridStreamUrl;
  }
  if (item.streamUrl) return item.streamUrl;
  return null;
}

function getBaseUrl(): string {
  if (typeof window !== "undefined") return "";
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export async function getBrowseData() {
  const [trending, popular, topRated, nowPlaying, libraryItems] = await Promise.all([
    fetchCatalog("trending"),
    fetchCatalog("popular"),
    fetchCatalog("top_rated"),
    fetchCatalog("now_playing"),
    fetchLibraryItems(),
  ]);

  const rows = [];

  if (trending.length > 0) {
    rows.push({ id: "trending", title: "Trending Now", items: trending });
  }
  if (libraryItems.length > 0) {
    rows.push({ id: "library", title: "My Plex Library", items: libraryItems.slice(0, 20) });
  }
  if (popular.length > 0) {
    rows.push({ id: "popular", title: "Popular on Netflix", items: popular });
  }
  if (topRated.length > 0) {
    rows.push({ id: "top_rated", title: "Top Rated", items: topRated });
  }
  if (nowPlaying.length > 0) {
    rows.push({ id: "now_playing", title: "New Releases", items: nowPlaying });
  }

  const hero = trending[0] ?? libraryItems[0] ?? popular[0] ?? null;

  return { rows, hero };
}
