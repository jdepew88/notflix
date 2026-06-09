import { NextRequest, NextResponse } from "next/server";
import { mergeSettings, mergeSettingsForServerOps } from "@/lib/settings";
import { filterByGenre } from "@/lib/plex";
import { resolveLibraryPath } from "@/lib/library-path";
import {
  cacheMatchesSettings,
  type LibraryCacheData,
} from "@/lib/library-cache";
import {
  databaseCompatibleWithSettings,
  readLibraryDatabase,
  databaseAsCache,
} from "@/lib/library-store";
import {
  isLibrarySyncRunning,
  startBackgroundLibrarySync,
  buildLibraryCatalog,
} from "@/lib/library-sync";
import { readLibrarySyncState, syncProgressPercent } from "@/lib/library-sync-state";
import { scheduleWatchProvidersBackfill } from "@/lib/library-providers";

function libraryConfigured(settings: ReturnType<typeof mergeSettings>): boolean {
  return Boolean(
    (settings.plexUrl?.trim() && settings.plexToken?.trim()) ||
      resolveLibraryPath(settings.libraryPath)
  );
}

export async function GET(request: NextRequest) {
  const settings = mergeSettingsForServerOps(request);
  const genreFilter = request.nextUrl.searchParams.get("genre");
  const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";

  const hasPlexUrl = Boolean(settings.plexUrl?.trim());
  const hasPlexToken = Boolean(settings.plexToken?.trim());
  const libraryPath = resolveLibraryPath(settings.libraryPath);
  const syncState = readLibrarySyncState();
  const syncing = isLibrarySyncRunning() || syncState.status === "running";
  const liveSync = syncing
    ? { ...readLibrarySyncState(), percent: syncProgressPercent(readLibrarySyncState()) }
    : syncState;

  try {
    if (hasPlexUrl && !hasPlexToken) {
      return NextResponse.json(
        { error: "Plex token required. Sign in with Plex or paste a token in Settings." },
        { status: 400 }
      );
    }
    if (hasPlexToken && !hasPlexUrl) {
      return NextResponse.json(
        { error: "Plex server URL required in Settings." },
        { status: 400 }
      );
    }
    if (!libraryConfigured(settings)) {
      return NextResponse.json({
        items: [],
        rows: [],
        source: "none",
        syncing: false,
        message:
          "Configure Plex URL + token or library path in Settings, then click Save & Sync Library.",
      });
    }

    const db = readLibraryDatabase();
    let cache: LibraryCacheData | null = db ? databaseAsCache(db) : null;
    let servedFromCache = false;
    let stale = false;

    if (cache && db) {
      if (cacheMatchesSettings(cache, settings)) {
        servedFromCache = true;
      } else if (databaseCompatibleWithSettings(db, settings)) {
        servedFromCache = true;
        stale = true;
      } else {
        cache = null;
      }
    }

    if (!cache && forceRefresh) {
      cache = await buildLibraryCatalog(settings, { forceRefresh: true });
      servedFromCache = false;
    } else if (!cache) {
      if (!syncing) {
        void startBackgroundLibrarySync(settings);
      }
      return NextResponse.json({
        items: [],
        rows: [],
        source: "none",
        count: 0,
        syncing: true,
        sync: liveSync,
        message: "Library sync in progress…",
      });
    } else if (forceRefresh && !syncing) {
      void startBackgroundLibrarySync(settings, { forceRefresh: true });
    } else if (stale && !syncing && !forceRefresh) {
      void startBackgroundLibrarySync(settings);
    }

    const country = request.nextUrl.searchParams.get("country") ?? "US";

    if (genreFilter) {
      const items = filterByGenre(cache.items, genreFilter);
      return NextResponse.json({
        items,
        rows: [],
        source: cache.source,
        count: items.length,
        genre: genreFilter,
        genres: cache.genres,
        cachedAt: cache.cachedAt,
        syncing,
        stale,
      });
    }

    if (settings.tmdbApiKey) {
      scheduleWatchProvidersBackfill(settings, country);
    }

    return NextResponse.json({
      items: cache.items,
      rows: cache.rows,
      source: cache.source,
      count: cache.items.length,
      genres: cache.genres,
      featuredHeroId: cache.featuredHeroId,
      heroPrimaryId: cache.heroPrimaryId ?? cache.featuredHeroId,
      heroVideoError: cache.heroVideoError ?? null,
      cached: servedFromCache,
      cachedAt: cache.cachedAt,
      syncing,
      stale,
      persisted: true,
      sync: syncing ? liveSync : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load library";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
