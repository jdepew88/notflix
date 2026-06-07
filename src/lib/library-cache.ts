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
  /** First-choice marquee title (revert target after failed video attempts). */
  heroPrimaryId?: string | null;
  /** Set when all hero preview attempts fail. */
  heroVideoError?: string | null;
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

export function updateLibraryCacheHero(
  featuredHeroId: string | null,
  heroPrimaryId: string | null,
  heroVideoError: string | null
): void {
  const cache = readLibraryCache();
  if (!cache) return;
  writeLibraryCache({
    ...cache,
    featuredHeroId,
    heroPrimaryId,
    heroVideoError,
  });
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

function isPlayableHeroMovie(item: MediaItem): boolean {
  return item.type === "movie" && Boolean(item.plexPartKey || item.filePath);
}

/** Up to `max` distinct movies suitable for marquee preview generation. */
export function pickHeroCandidates(
  items: MediaItem[],
  previousId?: string | null,
  max = 3
): MediaItem[] {
  const movies = items.filter((i) => i.type === "movie");
  const playable = movies.filter(isPlayableHeroMovie);
  const withBackdrop = playable.filter((i) => i.backdropPath || i.posterPath);
  const pool =
    withBackdrop.length > 0
      ? withBackdrop
      : playable.length > 0
        ? playable
        : movies;

  const result: MediaItem[] = [];
  const seen = new Set<string>();

  if (previousId) {
    const kept = pool.find((i) => i.id === previousId);
    if (kept && isPlayableHeroMovie(kept)) {
      result.push(kept);
      seen.add(kept.id);
    }
  }

  for (const movie of pool) {
    if (result.length >= max) break;
    if (!seen.has(movie.id) && isPlayableHeroMovie(movie)) {
      result.push(movie);
      seen.add(movie.id);
    }
  }

  return result.slice(0, max);
}

export function pickFeaturedHero(
  items: MediaItem[],
  previousId?: string | null
): MediaItem | null {
  return pickHeroCandidates(items, previousId, 1)[0] ?? null;
}

export function getFeaturedHeroFromCache(
  cache: LibraryCacheData
): MediaItem | null {
  if (!cache.featuredHeroId) return null;
  return cache.items.find((i) => i.id === cache.featuredHeroId) ?? null;
}
