import { getPlexItem } from "./plex";
import { resolvePlexPlayRatingKey } from "./plex-play-key";
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
  listTorrentDownloadSources,
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
  headline: string;
  description: string;
  canSearchDebrid: boolean;
}

export interface TorrentPickDownloadResult {
  mode: "pick";
  streams: TorrentioStreamOption[];
  item?: MediaItem;
  message?: string;
  headline: string;
  description: string;
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

function canSearchDebrid(request: PlayResolveRequest): boolean {
  if (request.plexOnly) return false;
  return Boolean(
    request.realDebridToken ||
      request.torrentioUrl ||
      request.peerflixUrl
  );
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
    const playKey = await resolvePlexPlayRatingKey(
      request.plexUrl.replace(/\/$/, ""),
      request.plexToken,
      ratingKey,
      request.season,
      request.episode
    );
    const plexItem = await getPlexItem(request.plexUrl, request.plexToken, playKey);
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
  request: PlayResolveRequest,
  label?: string
): DirectDownloadResult {
  const filename = sanitizeDownloadFilename(downloadFilenameForItem(item));
  const sourceLabel =
    label ?? (source === "library" ? "Local library" : source === "plex" ? "Plex" : "Real-Debrid");

  return {
    mode: "direct",
    downloadUrl: withDownloadQuery(streamUrl, filename),
    filename,
    source,
    label: sourceLabel,
    headline:
      source === "library"
        ? "Download from your library"
        : source === "plex"
          ? "Download from Plex"
          : "Download from Real-Debrid",
    description:
      source === "library"
        ? "Stream the original file from your mounted video folder."
        : source === "plex"
          ? "Download the original file from your Plex server — no transcoding."
          : "Download the cached stream from Real-Debrid.",
    canSearchDebrid: canSearchDebrid(request),
  };
}

async function resolveTorrentPick(
  request: PlayResolveRequest,
  libraryItem?: MediaItem
): Promise<TorrentPickDownloadResult> {
  const sources = await listTorrentDownloadSources(request);
  if (sources.source !== "torrentio" || !sources.streams?.length) {
    throw new Error(sources.message || "No English torrents found on Real-Debrid.");
  }

  return {
    mode: "pick",
    streams: sources.streams,
    item: sources.item ?? libraryItem,
    message: sources.message,
    headline: "Not in your Plex library",
    description:
      "Pick a torrent below. Notflix will unlock it through Real-Debrid and start the download.",
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

    return directDownloadFromItem(item, opened.streamUrl, "torrentio", merged, opened.streamLabel);
  }

  if (merged.forceDebrid) {
    return resolveTorrentPick(merged, libraryItem);
  }

  if (libraryItem?.filePath) {
    const item = itemWithMappedPath(libraryItem);
    const streamUrl = await buildLocalDownloadUrl(item, merged);
    if (!streamUrl) {
      throw new Error("No local file stream available for this title.");
    }
    return directDownloadFromItem(item, streamUrl, "library", merged, "Local library");
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
      merged,
      sources.source === "library" ? "Local library" : "Plex"
    );
  }

  if (sources.source === "torrentio" && sources.streams?.length) {
    return {
      mode: "pick",
      streams: sources.streams,
      item: sources.item,
      message: sources.message,
      headline: "Not in your Plex library",
      description:
        "Pick a torrent below. Notflix will unlock it through Real-Debrid and start the download.",
    };
  }

  throw new Error(sources.message || "No downloadable source found for this title.");
}
