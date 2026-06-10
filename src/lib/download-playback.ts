import { getPlexItem } from "./plex";
import { plexDirectStreamUrl } from "./plex-stream";
import { readLibraryDatabase } from "./library-store";
import { itemWithMappedPath, libraryStreamUrl } from "./library-playback";
import {
  downloadFilenameForItem,
  sanitizeDownloadFilename,
  withDownloadQuery,
} from "./download-filename";
import {
  enrichPlayResolveRequest,
  listPlaybackSources,
  openTorrentioStreamByIndex,
  type PlayResolveRequest,
} from "./play-resolve";
import type { TorrentioStreamOption } from "./torrentio";
import type { MediaItem } from "./types";

export interface DirectDownloadResult {
  mode: "direct";
  downloadUrl: string;
  filename: string;
  source: "library" | "plex" | "torrentio";
  label?: string;
}

export interface TorrentPickDownloadResult {
  mode: "pick";
  streams: TorrentioStreamOption[];
  item?: MediaItem;
  message?: string;
}

export type DownloadResolveResult = DirectDownloadResult | TorrentPickDownloadResult;

function findLibraryItem(itemId?: string): MediaItem | undefined {
  if (!itemId) return undefined;
  const db = readLibraryDatabase();
  return db?.items.find((item) => item.id === itemId);
}

function needsEpisodeSelection(item: MediaItem | undefined, request: PlayResolveRequest): boolean {
  if (item?.filePath) return false;
  if (request.type !== "series") return false;
  return request.season == null || request.episode == null;
}

function mergeDownloadRequest(
  request: PlayResolveRequest,
  libraryItem?: MediaItem
): PlayResolveRequest {
  return {
    ...request,
    title: request.title ?? libraryItem?.title,
    tmdbId: request.tmdbId ?? libraryItem?.tmdbId,
    seriesId: request.seriesId ?? libraryItem?.seriesId,
    season: request.season ?? libraryItem?.season,
    episode: request.episode ?? libraryItem?.episode,
    type:
      libraryItem?.type === "episode" || libraryItem?.type === "series"
        ? "series"
        : libraryItem?.type === "movie"
          ? "movie"
          : request.type,
    directPlayPreferred: false,
  };
}

async function buildLocalDownloadUrl(
  item: MediaItem,
  request: PlayResolveRequest
): Promise<string | null> {
  if (item.filePath) {
    const mapped = itemWithMappedPath(item);
    return libraryStreamUrl(mapped.filePath!);
  }

  if (item.plexPartKey && request.plexUrl) {
    return plexDirectStreamUrl(item.plexPartKey, request.plexUrl);
  }

  if (item.streamUrl?.startsWith("/api/")) {
    return item.streamUrl;
  }

  const ratingKey = item.plexRatingKey ?? item.id.replace(/^plex-/, "");
  if (ratingKey && request.plexUrl && request.plexToken) {
    const plexItem = await getPlexItem(request.plexUrl, request.plexToken, ratingKey);
    if (plexItem?.plexPartKey && request.plexUrl) {
      return plexDirectStreamUrl(plexItem.plexPartKey, request.plexUrl);
    }
  }

  return null;
}

function directDownloadFromItem(
  item: MediaItem,
  streamUrl: string,
  source: "library" | "plex" | "torrentio",
  label?: string
): DirectDownloadResult {
  const filename = sanitizeDownloadFilename(downloadFilenameForItem(item));
  return {
    mode: "direct",
    downloadUrl: withDownloadQuery(streamUrl, filename),
    filename,
    source,
    label,
  };
}

export async function resolveDownloadPlayback(
  request: PlayResolveRequest,
  itemId?: string,
  streamIndex?: number
): Promise<DownloadResolveResult> {
  const libraryItem = findLibraryItem(itemId);
  const merged = await enrichPlayResolveRequest(mergeDownloadRequest(request, libraryItem));

  if (needsEpisodeSelection(libraryItem, merged)) {
    throw new Error("Select an episode before downloading a TV show.");
  }

  if (streamIndex != null) {
    const opened = await openTorrentioStreamByIndex(merged, streamIndex);
    const item =
      opened.item ??
      libraryItem ??
      ({
        id: itemId ?? "download",
        title: merged.title ?? "video",
        type: merged.type === "series" ? "episode" : "movie",
        source: "debrid",
        season: merged.season,
        episode: merged.episode,
      } satisfies MediaItem);

    return directDownloadFromItem(item, opened.streamUrl, "torrentio", opened.streamLabel);
  }

  if (libraryItem?.filePath) {
    const item = itemWithMappedPath(libraryItem);
    const streamUrl = await buildLocalDownloadUrl(item, merged);
    if (!streamUrl) {
      throw new Error("No local file stream available for this title.");
    }
    return directDownloadFromItem(item, streamUrl, "library", "Local library");
  }

  const sources = await listPlaybackSources(merged);

  if (sources.source === "library" || sources.source === "plex") {
    if (!sources.item) {
      throw new Error("Matched title but no item metadata was returned.");
    }
    const streamUrl = await buildLocalDownloadUrl(sources.item, merged);
    if (!streamUrl) {
      throw new Error("No direct file stream available for this Plex/library title.");
    }
    return directDownloadFromItem(
      sources.item,
      streamUrl,
      sources.source,
      sources.source === "library" ? "Local library" : "Plex"
    );
  }

  if (sources.source === "torrentio" && sources.streams?.length) {
    return {
      mode: "pick",
      streams: sources.streams,
      item: sources.item,
      message: sources.message ?? "Choose a torrent to download via Real-Debrid",
    };
  }

  throw new Error(sources.message || "No downloadable source found for this title.");
}
