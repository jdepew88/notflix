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
  if (settings.plexUrl && settings.plexToken) {
    return `plex:${settings.plexUrl.replace(/\/$/, "")}:${hashPlexToken(settings.plexToken)}`;
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

  reportProgress({
    status: "running",
    phase: "starting",
    message: "Starting library sync…",
    current: 0,
    total: 1,
    itemsLoaded: previous?.items.length ?? 0,
    startedAt: new Date().toISOString(),
    finishedAt: undefined,
    error: undefined,
  });

  if (settings.plexUrl && settings.plexToken) {
    reportProgress({ phase: "fetching", message: "Connecting to Plex…", current: 0, total: 1 });
    let plexError: string | undefined;
    try {
      items = await fetchPlexLibrary(
        settings.plexUrl,
        settings.plexToken,
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
      reportProgress({
        phase: "fetching",
        message: `Plex unavailable (${plexError}). Scanning local folders…`,
        current: 0,
        total: 1,
      });
    }

    if (items.length === 0) {
      const libraryPath = resolveLibraryPath(settings.libraryPath);
      if (libraryPath) {
        items = await scanLibrary(libraryPath);
        source = "nfs";
        reportProgress({
          itemsLoaded: items.length,
          message: `Found ${items.length} files on disk`,
        });
      } else if (plexError) {
        throw new Error(plexError);
      }
    }
  } else {
    const libraryPath = resolveLibraryPath(settings.libraryPath);
    if (libraryPath) {
      reportProgress({ phase: "fetching", message: "Scanning video folder…", current: 0, total: 1 });
      items = await scanLibrary(libraryPath);
      source = "nfs";
      reportProgress({ itemsLoaded: items.length, message: `Found ${items.length} files` });
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
  } else if (settings.tmdbApiKey && items.length > 0) {
    reportProgress({
      phase: "enriching",
      message: "Enriching metadata from TMDB…",
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
    plexUrl: settings.plexUrl ? settings.plexUrl.replace(/\/$/, "") : "",
    plexTokenHash: settings.plexToken ? hashPlexToken(settings.plexToken) : "",
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

  reportProgress({
    status: "done",
    phase: "done",
    message: `Synced ${items.length} titles from ${source}`,
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
