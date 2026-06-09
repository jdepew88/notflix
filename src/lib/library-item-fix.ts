import type { ServerSettings } from "./server-settings";
import type { MediaItem, TmdbMediaType } from "./types";
import { fetchPlexMetadataItem } from "./plex";
import { resolvePlexConnection } from "./plex-connection";
import { applyTmdbMetadataToItem, searchTmdbForMatch } from "./tmdb";
import {
  clearLibraryItemOverride,
  overrideFromItem,
  patchLibraryItem,
} from "./library-item-overrides";
import { readLibraryDatabase } from "./library-store";

function findLibraryItem(itemId: string): MediaItem | null {
  const db = readLibraryDatabase();
  return db?.items.find((item) => item.id === itemId) ?? null;
}

export async function refreshItemArtwork(
  itemId: string,
  settings: ServerSettings
): Promise<MediaItem> {
  const item = findLibraryItem(itemId);
  if (!item) throw new Error("Title not found in library");

  const apiKey = settings.tmdbApiKey?.trim();
  if (!apiKey) throw new Error("TMDB API key required to update artwork");

  const enriched = await applyTmdbMetadataToItem(item, apiKey, {
    forceArtwork: true,
    query: item.title,
  });

  if (!enriched.posterPath && !enriched.backdropPath) {
    throw new Error(`No TMDB artwork found for "${item.title}"`);
  }

  const updated = patchLibraryItem(itemId, enriched, overrideFromItem(enriched, true));
  if (!updated) throw new Error("Failed to save artwork");
  return updated;
}

export async function matchItemToTmdb(
  itemId: string,
  settings: ServerSettings,
  opts: { tmdbId: number; mediaType: TmdbMediaType }
): Promise<MediaItem> {
  const item = findLibraryItem(itemId);
  if (!item) throw new Error("Title not found in library");

  const apiKey = settings.tmdbApiKey?.trim();
  if (!apiKey) throw new Error("TMDB API key required");

  const enriched = await applyTmdbMetadataToItem(item, apiKey, {
    tmdbId: opts.tmdbId,
    mediaType: opts.mediaType,
    forceArtwork: true,
  });

  const updated = patchLibraryItem(itemId, enriched, overrideFromItem(enriched, true));
  if (!updated) throw new Error("Failed to save metadata match");
  return updated;
}

export async function refreshItemFromPlex(
  itemId: string,
  settings: ServerSettings
): Promise<MediaItem> {
  const item = findLibraryItem(itemId);
  if (!item) throw new Error("Title not found in library");

  const plex = resolvePlexConnection(settings);
  if (!plex.plexUrl || !plex.plexToken) throw new Error("Plex not configured");

  const ratingKey = item.plexRatingKey ?? item.id.replace(/^plex-/, "");
  const fresh = await fetchPlexMetadataItem(plex.plexUrl, plex.plexToken, ratingKey);
  if (!fresh) throw new Error("Could not refresh from Plex");

  const patch: Partial<MediaItem> = {
    title: fresh.title,
    overview: fresh.overview ?? item.overview,
    posterPath: fresh.posterPath ?? item.posterPath,
    backdropPath: fresh.backdropPath ?? item.backdropPath,
    tmdbId: fresh.tmdbId ?? item.tmdbId,
    tvdbId: fresh.tvdbId ?? item.tvdbId,
    genres: fresh.genres?.length ? fresh.genres : item.genres,
    releaseDate: fresh.releaseDate ?? item.releaseDate,
    runtime: fresh.runtime ?? item.runtime,
  };

  const updated = patchLibraryItem(itemId, patch);
  if (!updated) throw new Error("Failed to save Plex refresh");
  return updated;
}

export async function searchMetadataMatches(
  itemId: string,
  settings: ServerSettings,
  query?: string
): Promise<MediaItem[]> {
  const item = findLibraryItem(itemId);
  if (!item) throw new Error("Title not found in library");

  const apiKey = settings.tmdbApiKey?.trim();
  if (!apiKey) throw new Error("TMDB API key required");

  const mediaType =
    item.type === "series" ? ("tv" as const) : item.type === "movie" ? ("movie" as const) : undefined;

  return searchTmdbForMatch(apiKey, query?.trim() || item.title, mediaType);
}

export function resetItemMetadataOverride(itemId: string): MediaItem {
  const item = clearLibraryItemOverride(itemId);
  if (!item) throw new Error("Title not found in library");
  return item;
}

export function getLibraryItem(itemId: string): MediaItem | null {
  const db = readLibraryDatabase();
  return db?.items.find((item) => item.id === itemId) ?? null;
}
