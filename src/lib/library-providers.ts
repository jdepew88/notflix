import type { LibraryCacheData } from "./library-cache";
import {
  databaseAsCache,
  readLibraryDatabase,
  writeLibraryDatabase,
} from "./library-store";
import { enrichItemsWithWatchProviders } from "./tmdb";
import type { ServerSettings } from "./server-settings";
import type { MediaItem } from "./types";

const DEFAULT_COUNTRY = "US";

function itemsNeedingProviders(items: MediaItem[]): MediaItem[] {
  return items.filter((item) => item.tmdbId && !item.watchProviders);
}

async function enrichRows(
  rows: LibraryCacheData["rows"],
  apiKey: string,
  country: string
): Promise<LibraryCacheData["rows"]> {
  const rowItems = rows.flatMap((row) => row.items);
  const needs = itemsNeedingProviders(rowItems);
  if (needs.length === 0) return rows;

  const enrichedItems = await enrichItemsWithWatchProviders(needs, apiKey, country);
  const byId = new Map(enrichedItems.map((item) => [item.id, item]));

  return rows.map((row) => ({
    ...row,
    items: row.items.map((item) => byId.get(item.id) ?? item),
  }));
}

function mergeEnrichedIntoItems(items: MediaItem[], enriched: MediaItem[]): MediaItem[] {
  const byId = new Map(enriched.map((item) => [item.id, item]));
  return items.map((item) => byId.get(item.id) ?? item);
}

export function libraryWatchProvidersCached(
  cache: LibraryCacheData,
  country = DEFAULT_COUNTRY
): boolean {
  return Boolean(cache.watchProvidersAt && cache.watchProvidersCountry === country);
}

export async function attachWatchProvidersToLibrary(
  cache: LibraryCacheData,
  apiKey: string,
  options: { country?: string } = {}
): Promise<LibraryCacheData> {
  const country = options.country ?? DEFAULT_COUNTRY;
  const rows = await enrichRows(cache.rows, apiKey, country);
  const enrichedRowItems = rows.flatMap((row) => row.items);
  const items = mergeEnrichedIntoItems(cache.items, enrichedRowItems);

  return {
    ...cache,
    rows,
    items,
    watchProvidersCountry: country,
    watchProvidersAt: new Date().toISOString(),
  };
}

export async function enrichAndPersistWatchProviders(
  settings: ServerSettings,
  country = DEFAULT_COUNTRY
): Promise<boolean> {
  const apiKey = settings.tmdbApiKey?.trim();
  if (!apiKey) return false;

  const db = readLibraryDatabase();
  if (!db || db.items.length === 0) return false;

  const cache = databaseAsCache(db);
  if (libraryWatchProvidersCached(cache, country)) return false;

  const enriched = await attachWatchProvidersToLibrary(cache, apiKey, { country });
  writeLibraryDatabase({
    ...db,
    items: enriched.items,
    rows: enriched.rows,
    watchProvidersCountry: enriched.watchProvidersCountry,
    watchProvidersAt: enriched.watchProvidersAt,
  });
  return true;
}

let watchProvidersInFlight: Promise<void> | null = null;

/** Backfill watch providers for older library databases without blocking API responses. */
export function scheduleWatchProvidersBackfill(
  settings: ServerSettings,
  country = DEFAULT_COUNTRY
): void {
  const apiKey = settings.tmdbApiKey?.trim();
  if (!apiKey) return;

  const db = readLibraryDatabase();
  if (!db || db.items.length === 0) return;

  const cache = databaseAsCache(db);
  if (libraryWatchProvidersCached(cache, country)) return;
  if (watchProvidersInFlight) return;

  watchProvidersInFlight = enrichAndPersistWatchProviders(settings, country)
    .catch((err) => {
      console.warn("[library-providers] watch provider backfill failed:", err);
    })
    .finally(() => {
      watchProvidersInFlight = null;
    })
    .then(() => undefined);

  void watchProvidersInFlight;
}
