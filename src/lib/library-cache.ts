import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import type { MediaItem } from "./types";
import type { ServerSettings } from "./server-settings";
import { getDataPath } from "./data-path";
import { resolveLibraryPath } from "./library-path";

export interface LibraryCacheData {
  version: 1;
  cachedAt: string;
  source: string;
  plexUrl: string;
  plexTokenHash: string;
  libraryPath: string;
  items: MediaItem[];
  rows: Array<{ id: string; title: string; items: MediaItem[] }>;
  genres: string[];
  featuredHeroId: string | null;
}

const CACHE_VERSION = 1 as const;

function cacheFilePath(): string {
  return path.join(getDataPath(), "library-cache.json");
}

function normalizePlexUrl(url: string): string {
  return url.replace(/\/$/, "");
}

export function hashPlexToken(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 12);
}

export function readLibraryCache(): LibraryCacheData | null {
  try {
    const raw = fs.readFileSync(cacheFilePath(), "utf8");
    const data = JSON.parse(raw) as LibraryCacheData;
    if (data.version !== CACHE_VERSION || !Array.isArray(data.items)) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeLibraryCache(data: LibraryCacheData): void {
  const file = cacheFilePath();
  const tmp = `${file}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

export function deleteLibraryCache(): void {
  try {
    fs.unlinkSync(cacheFilePath());
  } catch {
    /* ignore */
  }
}

export function cacheMatchesSettings(
  cache: LibraryCacheData,
  settings: ServerSettings
): boolean {
  if (settings.plexUrl && settings.plexToken) {
    return (
      cache.source === "plex" &&
      cache.plexUrl === normalizePlexUrl(settings.plexUrl) &&
      cache.plexTokenHash === hashPlexToken(settings.plexToken)
    );
  }
  if (cache.source !== "nfs") return false;
  return cache.libraryPath === resolveLibraryPath(settings.libraryPath);
}

export function pickFeaturedHero(
  items: MediaItem[],
  previousId?: string | null
): MediaItem | null {
  if (previousId) {
    const kept = items.find((i) => i.id === previousId);
    if (kept && kept.type === "movie") return kept;
  }

  const movies = items.filter((i) => i.type === "movie");
  const withBackdrop = movies.find((i) => i.backdropPath || i.posterPath);
  return withBackdrop ?? movies[0] ?? items[0] ?? null;
}

export function getFeaturedHeroFromCache(
  cache: LibraryCacheData
): MediaItem | null {
  if (!cache.featuredHeroId) return null;
  return cache.items.find((i) => i.id === cache.featuredHeroId) ?? null;
}
