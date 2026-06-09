import type { MediaItem } from "./types";
import type { ServerSettings } from "./server-settings";
import { resolveLibraryPath } from "./library-path";
import { resolvePlexConnection } from "./plex-connection";
import {
  readLibraryDatabase,
  writeLibraryDatabase,
  deleteLibraryDatabase,
  databaseAsCache,
  cacheDataToDatabase,
  updateLibraryDatabaseHero,
  hashPlexToken,
} from "./library-store";

export { hashPlexToken };

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
  watchProvidersCountry?: string;
  watchProvidersAt?: string;
}

const CACHE_VERSION = 1 as const;

function normalizePlexUrl(url: string): string {
  return url.replace(/\/$/, "");
}

export function readLibraryCache(): LibraryCacheData | null {
  const db = readLibraryDatabase();
  return db ? databaseAsCache(db) : null;
}

export function writeLibraryCache(data: LibraryCacheData): void {
  writeLibraryDatabase(cacheDataToDatabase(data));
}

export function updateLibraryCacheHero(
  featuredHeroId: string | null,
  heroPrimaryId: string | null,
  heroVideoError: string | null
): void {
  updateLibraryDatabaseHero(featuredHeroId, heroPrimaryId, heroVideoError);
}

export function deleteLibraryCache(): void {
  deleteLibraryDatabase();
}

export function cacheMatchesSettings(
  cache: LibraryCacheData,
  settings: ServerSettings
): boolean {
  const plex = resolvePlexConnection(settings);
  if (plex.plexUrl && plex.plexToken) {
    return (
      cache.source === "plex" &&
      cache.plexUrl === normalizePlexUrl(plex.plexUrl) &&
      cache.plexTokenHash === hashPlexToken(plex.plexToken)
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
