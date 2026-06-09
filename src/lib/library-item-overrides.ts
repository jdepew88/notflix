import type { MediaItem, TmdbMediaType } from "./types";
import {
  readLibraryDatabase,
  writeLibraryDatabase,
  type LibraryDatabase,
} from "./library-store";

export interface LibraryItemOverride {
  tmdbId?: number;
  mediaType?: TmdbMediaType;
  posterPath?: string;
  backdropPath?: string;
  overview?: string;
  genres?: string[];
  genreIds?: number[];
  rating?: number;
  releaseDate?: string;
  runtime?: number;
  /** When true, poster/backdrop from override win over Plex on resync. */
  useTmdbArtwork?: boolean;
  updatedAt: string;
}

export function overrideFromItem(item: MediaItem, useTmdbArtwork = true): LibraryItemOverride {
  return {
    tmdbId: item.tmdbId,
    mediaType: item.mediaType,
    posterPath: item.posterPath,
    backdropPath: item.backdropPath,
    overview: item.overview,
    genres: item.genres,
    genreIds: item.genreIds,
    rating: item.rating,
    releaseDate: item.releaseDate,
    runtime: item.runtime,
    useTmdbArtwork,
    updatedAt: new Date().toISOString(),
  };
}

export function applyOverrideToItem(
  item: MediaItem,
  override?: LibraryItemOverride
): MediaItem {
  if (!override) return item;

  const useArt =
    override.useTmdbArtwork ||
    Boolean(override.posterPath || override.backdropPath);

  return {
    ...item,
    ...(override.tmdbId !== undefined && { tmdbId: override.tmdbId }),
    ...(override.mediaType && { mediaType: override.mediaType }),
    ...(override.overview && { overview: override.overview }),
    ...(override.genres && { genres: override.genres }),
    ...(override.genreIds && { genreIds: override.genreIds }),
    ...(override.rating !== undefined && { rating: override.rating }),
    ...(override.releaseDate && { releaseDate: override.releaseDate }),
    ...(override.runtime !== undefined && { runtime: override.runtime }),
    ...(useArt && override.posterPath !== undefined && { posterPath: override.posterPath }),
    ...(useArt && override.backdropPath !== undefined && { backdropPath: override.backdropPath }),
  };
}

export function applyOverridesToItems(
  items: MediaItem[],
  overrides: Record<string, LibraryItemOverride> = {}
): MediaItem[] {
  if (!Object.keys(overrides).length) return items;
  return items.map((item) => applyOverrideToItem(item, overrides[item.id]));
}

function patchRows(
  rows: LibraryDatabase["rows"],
  itemId: string,
  patch: Partial<MediaItem>
): LibraryDatabase["rows"] {
  return rows.map((row) => ({
    ...row,
    items: row.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
  }));
}

export function patchLibraryItem(
  itemId: string,
  patch: Partial<MediaItem>,
  override?: LibraryItemOverride
): MediaItem | null {
  const db = readLibraryDatabase();
  if (!db) return null;

  const index = db.items.findIndex((item) => item.id === itemId);
  if (index < 0) return null;

  const updated = { ...db.items[index], ...patch };
  db.items[index] = updated;
  db.rows = patchRows(db.rows, itemId, patch);

  if (override) {
    db.itemOverrides = { ...(db.itemOverrides ?? {}), [itemId]: override };
  }

  writeLibraryDatabase(db);
  return updated;
}

export function clearLibraryItemOverride(itemId: string): MediaItem | null {
  const db = readLibraryDatabase();
  if (!db) return null;

  const overrides = { ...(db.itemOverrides ?? {}) };
  delete overrides[itemId];
  db.itemOverrides = overrides;
  writeLibraryDatabase(db);
  return db.items.find((item) => item.id === itemId) ?? null;
}

export function applyStoredOverridesToDatabase(db: LibraryDatabase): LibraryDatabase {
  const overrides = db.itemOverrides ?? {};
  if (!Object.keys(overrides).length) return db;

  const items = applyOverridesToItems(db.items, overrides);
  const rows = db.rows.map((row) => ({
    ...row,
    items: applyOverridesToItems(row.items, overrides),
  }));

  return { ...db, items, rows };
}
