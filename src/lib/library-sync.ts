import {
  buildContentRowsFromPlex,
  collectGenres,
  fetchPlexLibrary,
  type PlexFetchProgress,
} from "./plex";
import { scanLibrary, buildContentRows } from "./library";
import { enrichLibraryWithTmdb } from "./tmdb";
import { enrichWithTvdb } from "./tvdb";
import { resolveLibraryPath } from "./library-path";
import { plexConfigured, resolvePlexConnection } from "./plex-connection";
import type { MediaItem } from "./types";
import type { ServerSettings } from "./server-settings";
import {
  hashPlexToken,
  pickFeaturedHero,
  pickHeroCandidates,
  readLibraryCache,
  type LibraryCacheData,
} from "./library-cache";
import {
  readLibraryDatabase,
  writeLibraryDatabase,
  type LibraryDatabase,
} from "./library-store";
import {
  readLibrarySyncState,
  updateLibrarySyncState,
  resetLibrarySyncState,
} from "./library-sync-state";
import { initializeAndResolveHeroVideo } from "./hero-resolve";

interface BuildOptions {
  forceRefresh?: boolean;
}

let buildInFlight: Promise<LibraryCacheData> | null = null;
let buildInFlightKey: string | null = null;
let backgroundSyncStarted = false;

function buildKey(settings: ServerSettings): string {
  const plex = resolvePlexConnection(settings);
  if (plex.plexUrl && plex.plexToken) {
    return `plex:${plex.plexUrl}:${hashPlexToken(plex.plexToken)}`;
  }
  return `nfs:${resolveLibraryPath(settings.libraryPath)}`;
}

function reportProgress(
  patch: Parameters<typeof updateLibrarySyncState>[0]
): void {
  updateLibrarySyncState(patch);
}

async function buildLibraryCatalogInner(
  settings: ServerSettings,
  options: BuildOptions = {}
): Promise<LibraryCacheData> {
  const previous = readLibraryCache();
  let items: MediaItem[] = [];
  let source = "none";

  const cachedCount = previous?.items.length ?? 0;

  reportProgress({
    status: "running",
    phase: "starting",
    message: cachedCount
      ? `Starting library sync (${cachedCount} titles cached)…`
      : "Starting library sync…",
    current: 0,
    total: 1,
    itemsLoaded: 0,
    startedAt: new Date().toISOString(),
    finishedAt: undefined,
    error: undefined,
  });

  const plex = resolvePlexConnection(settings);

  if (plexConfigured(settings)) {
    reportProgress({
      phase: "fetching",
      message: `Connecting to Plex at ${plex.plexUrl}…`,
      current: 0,
      total: 1,
      itemsLoaded: 0,
    });
    let plexError: string | undefined;
    try {
      items = await fetchPlexLibrary(
        plex.plexUrl,
        plex.plexToken,
        (progress: PlexFetchProgress) => {
          reportProgress({
            phase: "fetching",
            message: progress.message,
            current: progress.sectionIndex,
            total: Math.max(progress.sectionCount, 1),
            itemsLoaded: progress.itemsLoaded,
          });
        }
      );
      source = "plex";
    } catch (err) {
      plexError = err instanceof Error ? err.message : "Plex fetch failed";
      console.warn("[library-sync] Plex unavailable:", plexError);

      if (previous && previous.items.length > 0) {
        reportProgress({
          status: "done",
          phase: "done",
          message: `Plex unavailable — keeping ${previous.items.length} cached titles. Fix PLEX_URL/token and Save & Sync.`,
          current: 1,
          total: 1,
          itemsLoaded: previous.items.length,
          finishedAt: new Date().toISOString(),
          error: plexError,
        });
        return previous;
      }

      const libraryPath = resolveLibraryPath(settings.libraryPath);
      if (libraryPath) {
        reportProgress({
          phase: "fetching",
          message: `Plex unavailable. Scanning ${libraryPath}…`,
          current: 0,
          total: 0,
          itemsLoaded: 0,
        });
        items = await scanLibrary(libraryPath, (found, dir) => {
          reportProgress({
            phase: "fetching",
            message: `Scanning ${dir.replace(/^\/media\/?/, "") || "library"}… ${found} files`,
            current: 0,
            total: 0,
            itemsLoaded: found,
          });
        });
        source = "nfs";
        reportProgress({
          itemsLoaded: items.length,
          message: `Found ${items.length} files on disk`,
          current: 1,
          total: 1,
        });
      } else {
        throw new Error(plexError);
      }
    }
  } else {
    const libraryPath = resolveLibraryPath(settings.libraryPath);
    if (libraryPath) {
      reportProgress({
        phase: "fetching",
        message: `Scanning ${libraryPath}…`,
        current: 0,
        total: 0,
        itemsLoaded: 0,
      });
      items = await scanLibrary(libraryPath, (found, dir) => {
        reportProgress({
          phase: "fetching",
          message: `Scanning ${dir.replace(/^\/media\/?/, "") || "library"}… ${found} files`,
          current: 0,
          total: 0,
          itemsLoaded: found,
        });
      });
      source = "nfs";
      reportProgress({
        itemsLoaded: items.length,
        message: `Found ${items.length} files`,
        current: 1,
        total: 1,
      });
    }
  }

  if (
    items.length === 0 &&
    previous &&
    previous.items.length > 0 &&
    !options.forceRefresh
  ) {
    reportProgress({
      status: "done",
      phase: "done",
      message: `Using cached library (${previous.items.length} titles)`,
      current: 1,
      total: 1,
      itemsLoaded: previous.items.length,
      finishedAt: new Date().toISOString(),
    });
    return previous;
  }

  if (settings.tvdbApiKey && items.length > 0) {
    reportProgress({
      phase: "enriching",
      message: "Enriching metadata from TVDB…",
      current: 0,
      total: 1,
      itemsLoaded: items.length,
    });
    items = await enrichWithTvdb(items, settings.tvdbApiKey);
  }

  if (settings.tmdbApiKey && items.length > 0) {
    reportProgress({
      phase: "enriching",
      message: settings.tvdbApiKey
        ? "Enriching metadata from TMDB (TVDB + TMDB)…"
        : "Enriching metadata from TMDB…",
      current: 0,
      total: 1,
      itemsLoaded: items.length,
    });
    items = await enrichLibraryWithTmdb(items, settings.tmdbApiKey);
  }

  reportProgress({
    phase: "building-rows",
    message: "Building browse rows…",
    current: 1,
    total: 1,
    itemsLoaded: items.length,
  });

  const featured = pickFeaturedHero(items, previous?.featuredHeroId);
  const rows =
    source === "plex" ? buildContentRowsFromPlex(items) : buildContentRows(items);

  const heroCandidates = pickHeroCandidates(items, previous?.featuredHeroId);

  const db: LibraryDatabase = {
    version: 2,
    cachedAt: new Date().toISOString(),
    source,
    plexUrl: plex.plexUrl,
    plexTokenHash: plex.plexToken ? hashPlexToken(plex.plexToken) : "",
    libraryPath: resolveLibraryPath(settings.libraryPath),
    items,
    rows,
    genres: collectGenres(items),
    featuredHeroId: featured?.id ?? null,
    heroPrimaryId: heroCandidates[0]?.id ?? featured?.id ?? null,
    heroVideoError: null,
  };

  reportProgress({
    phase: "saving",
    message: `Saving ${items.length} titles to library database…`,
    itemsLoaded: items.length,
  });

  writeLibraryDatabase(db);

  const episodeCount = items.filter((i) => i.type === "episode").length;
  const showCount = items.filter((i) => i.type === "series").length;
  const movieCount = items.filter((i) => i.type === "movie").length;
  const countParts = [
    movieCount ? `${movieCount} movies` : "",
    showCount ? `${showCount} shows` : "",
    episodeCount ? `${episodeCount} episodes` : "",
  ].filter(Boolean);

  reportProgress({
    status: "done",
    phase: "done",
    message: `Synced ${items.length} titles from ${source}${countParts.length ? ` (${countParts.join(", ")})` : ""}`,
    current: 1,
    total: 1,
    itemsLoaded: items.length,
    finishedAt: new Date().toISOString(),
  });

  if (heroCandidates.length > 0) {
    void initializeAndResolveHeroVideo(items, settings, previous?.featuredHeroId);
  }

  return { ...db, version: 1 };
}

export async function buildLibraryCatalog(
  settings: ServerSettings,
  options: BuildOptions = {}
): Promise<LibraryCacheData> {
  const key = buildKey(settings);
  if (buildInFlight && buildInFlightKey === key) {
    return buildInFlight;
  }

  const job = buildLibraryCatalogInner(settings, options)
    .catch((err) => {
      const message = err instanceof Error ? err.message : "Library sync failed";
      updateLibrarySyncState({
        status: "error",
        phase: "error",
        message,
        error: message,
        finishedAt: new Date().toISOString(),
      });
      throw err;
    })
    .finally(() => {
      if (buildInFlightKey === key) {
        buildInFlight = null;
        buildInFlightKey = null;
      }
    });

  buildInFlight = job;
  buildInFlightKey = key;
  return job;
}

export function isLibrarySyncRunning(): boolean {
  return readLibrarySyncState().status === "running" || buildInFlight !== null;
}

export async function startBackgroundLibrarySync(
  settings: ServerSettings,
  options: BuildOptions = {}
): Promise<void> {
  if (isLibrarySyncRunning()) return;
  resetLibrarySyncState();
  try {
    await buildLibraryCatalog(settings, options);
  } catch (err) {
    console.warn("[library-sync] Background sync failed:", err);
  }
}

export function scheduleBackgroundLibrarySync(settings: ServerSettings): void {
  if (backgroundSyncStarted || isLibrarySyncRunning()) return;
  if (!settings.plexUrl?.trim() && !resolveLibraryPath(settings.libraryPath)) return;

  backgroundSyncStarted = true;
  void startBackgroundLibrarySync(settings);
}

export function resetSyncTracking(): void {
  resetLibrarySyncState();
}

export function getStoredTitleCount(): number {
  return readLibraryDatabase()?.items.length ?? 0;
}
