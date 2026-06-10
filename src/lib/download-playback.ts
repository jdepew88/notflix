import { getPlexItem } from "./plex";
import { resolvePlexPlayRatingKey } from "./plex-play-key";
import { plexDirectStreamUrl } from "./plex-stream";
import { readLibraryDatabase } from "./library-store";
import {
  itemWithMappedPath,
  libraryStreamUrl,
  resolveAccessibleLibraryFile,
} from "./library-playback";
import { resolveLibraryPath } from "./library-path";
import {
  buildDownloadUrl,
  downloadFilenameForItem,
  sanitizeDownloadFilename,
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
    forDownload: true,
  };
}

function canSearchDebrid(request: PlayResolveRequest): boolean {
  if (request.plexOnly) return false;
  return Boolean(
    request.realDebridToken || request.torrentioUrl || request.peerflixUrl
  );
}

function libraryRootForRequest(request: PlayResolveRequest): string {
  return resolveLibraryPath(request.libraryPath);
}

function downloadSourceForStreamUrl(streamUrl: string): "library" | "plex" {
  return streamUrl.includes("/api/plex/stream") ? "plex" : "library";
}

async function buildLocalDownloadUrl(
  item: MediaItem,
  request: PlayResolveRequest
): Promise<string | null> {
  const libraryRoot = libraryRootForRequest(request);

  if (item.filePath) {
    const accessible = resolveAccessibleLibraryFile(item.filePath, libraryRoot);
    if (accessible) {
      return libraryStreamUrl(item.filePath, libraryRoot);
    }
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
    downloadUrl: buildDownloadUrl(streamUrl, filename, {
      plexToken: source === "plex" ? request.plexToken : undefined,
    }),
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
        ? "Download the original file from your mounted video folder."
        : source === "plex"
          ? "Download the original file from your Plex server over HTTPS."
          : "Download the unlocked file from Real-Debrid over HTTPS.",
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
      "Choose a torrent below. Notflix unlocks it through Real-Debrid, then your browser downloads the file over HTTPS.",
  };
}

async function tryLocalDownload(
  request: PlayResolveRequest,
  libraryItem?: MediaItem
): Promise<DirectDownloadResult | null> {
  if (libraryItem?.filePath) {
    const item = itemWithMappedPath(libraryItem, libraryRootForRequest(request));
    const streamUrl = await buildLocalDownloadUrl(item, request);
    if (streamUrl) {
      const source = downloadSourceForStreamUrl(streamUrl);
      return directDownloadFromItem(
        item,
        streamUrl,
        source,
        request,
        source === "library" ? "Local library" : "Plex"
      );
    }
  }

  const sources = await listPlaybackSources(request);

  if (sources.source === "library" || sources.source === "plex") {
    if (!sources.item) return null;
    const streamUrl = await buildLocalDownloadUrl(sources.item, request);
    if (!streamUrl) return null;
    return directDownloadFromItem(
      sources.item,
      streamUrl,
      sources.source,
      request,
      sources.source === "library" ? "Local library" : "Plex"
    );
  }

  return null;
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

  const local = await tryLocalDownload(merged, libraryItem);
  if (local) {
    return local;
  }

  if (canSearchDebrid(merged)) {
    return resolveTorrentPick(merged, libraryItem);
  }

  const sources = await listPlaybackSources(merged);
  throw new Error(
    sources.message ||
      "Title is not in Plex and Real-Debrid is not configured. Add your Debrid token in Settings."
  );
}
