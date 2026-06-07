import type { LibraryCacheData } from "./library-cache";
import { enrichItemsWithWatchProviders } from "./tmdb";
import type { MediaItem } from "./types";

async function enrichRows(
  rows: LibraryCacheData["rows"],
  apiKey: string,
  country: string
): Promise<LibraryCacheData["rows"]> {
  const rowItems = rows.flatMap((row) => row.items);
  if (rowItems.length === 0) return rows;

  const enrichedItems = await enrichItemsWithWatchProviders(rowItems, apiKey, country);
  const byId = new Map(enrichedItems.map((item) => [item.id, item]));

  return rows.map((row) => ({
    ...row,
    items: row.items.map((item) => byId.get(item.id) ?? item),
  }));
}

function mergeEnrichedIntoItems(
  items: MediaItem[],
  enriched: MediaItem[]
): MediaItem[] {
  const byId = new Map(enriched.map((item) => [item.id, item]));
  return items.map((item) => byId.get(item.id) ?? item);
}

export async function attachWatchProvidersToLibrary(
  cache: LibraryCacheData,
  apiKey: string,
  options: { country?: string } = {}
): Promise<LibraryCacheData> {
  const country = options.country ?? "US";
  const rows = await enrichRows(cache.rows, apiKey, country);
  const enrichedRowItems = rows.flatMap((row) => row.items);
  const items = mergeEnrichedIntoItems(cache.items, enrichedRowItems);

  return { ...cache, rows, items };
}
