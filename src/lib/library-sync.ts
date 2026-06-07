import {
  buildContentRowsFromPlex,
  collectGenres,
  fetchPlexLibrary,
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
  readLibraryCache,
  writeLibraryCache,
  type LibraryCacheData,
} from "./library-cache";
import { scheduleHeroPreview } from "./hero-cache";

interface BuildOptions {
  forceRefresh?: boolean;
}

let buildInFlight: Promise<LibraryCacheData> | null = null;
let buildInFlightKey: string | null = null;

function buildKey(settings: ServerSettings): string {
  if (settings.plexUrl && settings.plexToken) {
    return `plex:${settings.plexUrl.replace(/\/$/, "")}:${hashPlexToken(settings.plexToken)}`;
  }
  return `nfs:${resolveLibraryPath(settings.libraryPath)}`;
}

async function buildLibraryCatalogInner(
  settings: ServerSettings,
  options: BuildOptions = {}
): Promise<LibraryCacheData> {
  const previous = readLibraryCache();
  let items: MediaItem[] = [];
  let source = "none";

  if (settings.plexUrl && settings.plexToken) {
    items = await fetchPlexLibrary(settings.plexUrl, settings.plexToken);
    source = "plex";
  } else {
    const libraryPath = resolveLibraryPath(settings.libraryPath);
    if (libraryPath) {
      items = await scanLibrary(libraryPath);
      source = "nfs";
    }
  }

  if (
    items.length === 0 &&
    previous &&
    previous.items.length > 0 &&
    !options.forceRefresh
  ) {
    return previous;
  }

  if (settings.tvdbApiKey && items.length > 0) {
    items = await enrichWithTvdb(items, settings.tvdbApiKey);
  } else if (settings.tmdbApiKey && items.length > 0) {
    items = await enrichLibraryWithTmdb(items, settings.tmdbApiKey);
  }

  const featured = pickFeaturedHero(items, previous?.featuredHeroId);
  const rows =
    source === "plex" ? buildContentRowsFromPlex(items) : buildContentRows(items);

  const cache: LibraryCacheData = {
    version: 1,
    cachedAt: new Date().toISOString(),
    source,
    plexUrl: settings.plexUrl ? settings.plexUrl.replace(/\/$/, "") : "",
    plexTokenHash: settings.plexToken ? hashPlexToken(settings.plexToken) : "",
    libraryPath: resolveLibraryPath(settings.libraryPath),
    items,
    rows,
    genres: collectGenres(items),
    featuredHeroId: featured?.id ?? null,
  };

  writeLibraryCache(cache);

  if (featured) {
    scheduleHeroPreview(featured, settings, previous?.featuredHeroId ?? null);
  }

  return cache;
}

export async function buildLibraryCatalog(
  settings: ServerSettings,
  options: BuildOptions = {}
): Promise<LibraryCacheData> {
  const key = buildKey(settings);
  if (buildInFlight && buildInFlightKey === key) {
    return buildInFlight;
  }

  const job = buildLibraryCatalogInner(settings, options).finally(() => {
    if (buildInFlightKey === key) {
      buildInFlight = null;
      buildInFlightKey = null;
    }
  });

  buildInFlight = job;
  buildInFlightKey = key;
  return job;
}
