import { fetchPlexLibrary } from "./plex";
import { findInPlexLibrary } from "./plex-match";
import { plexDirectStreamUrl } from "./plex-stream";
import { readLibraryDatabase } from "./library-store";
import { itemWithMappedPath, libraryStreamUrl } from "./library-playback";
import { resolvePeerflixBaseUrl } from "./peerflix";
import {
  buildDefaultTorrentioUrl,
  buildStreamVideoId,
  fetchTorrentioStreams,
  normalizeTorrentioBaseUrl,
  resolveTorrentioStreamUrl,
  type TorrentioStreamOption,
} from "./torrentio";
import { fetchStremioStreams, mergeStremioStreamLists } from "./stremio-streams";
import { registerStreamUrlIfLong } from "./stream-sessions";
import { getMovieDetails, getMovieExternalIds } from "./tmdb";
import type { MediaItem } from "./types";

export interface PlayResolveRequest {
  tmdbId?: number;
  type: "movie" | "series";
  season?: number;
  episode?: number;
  title?: string;
  year?: number;
  plexUrl?: string;
  plexToken?: string;
  torrentioUrl?: string;
  peerflixUrl?: string;
  realDebridToken?: string;
  tmdbApiKey?: string;
  plexOnly?: boolean;
}

export interface PlayResolveResult {
  source: "plex" | "library" | "torrentio" | "none";
  item?: MediaItem;
  watchId?: string;
  streamUrl?: string;
  streamLabel?: string;
  message?: string;
}

export interface ListPlaybackSourcesResult {
  source: "plex" | "library" | "torrentio" | "none";
  item?: MediaItem;
  watchId?: string;
  plexRatingKey?: string;
  streams?: TorrentioStreamOption[];
  message?: string;
}

export interface OpenTorrentioStreamResult {
  item?: MediaItem;
  streamUrl: string;
  streamSession?: string;
  streamLabel: string;
}

async function buildMediaItem(request: PlayResolveRequest): Promise<MediaItem | undefined> {
  const { tmdbId, type, title, year, tmdbApiKey } = request;
  if (!tmdbId) return undefined;

  if (tmdbApiKey && type === "movie") {
    try {
      const movie = await getMovieDetails(tmdbApiKey, tmdbId);
      return {
        id: `tmdb-${tmdbId}`,
        tmdbId,
        title: movie.title,
        overview: movie.overview,
        posterPath: movie.poster_path ?? undefined,
        backdropPath: movie.backdrop_path ?? undefined,
        releaseDate: movie.release_date,
        rating: movie.vote_average,
        type: "movie",
        source: "debrid",
      };
    } catch {
      /* metadata optional */
    }
  }

  return {
    id: `tmdb-${tmdbId}`,
    tmdbId,
    title: title ?? "Stream",
    releaseDate: year ? String(year) : undefined,
    type,
    source: "debrid",
    season: request.season,
    episode: request.episode,
  };
}

async function resolveImdbId(request: PlayResolveRequest): Promise<string | undefined> {
  const { tmdbApiKey, tmdbId, type } = request;
  if (!tmdbApiKey || !tmdbId || type !== "movie") return undefined;
  try {
    const external = await getMovieExternalIds(tmdbApiKey, tmdbId);
    return external.imdb_id ?? undefined;
  } catch {
    return undefined;
  }
}

function torrentioBaseUrl(request: PlayResolveRequest): string {
  return (
    (request.torrentioUrl && normalizeTorrentioBaseUrl(request.torrentioUrl)) ||
    (request.realDebridToken ? buildDefaultTorrentioUrl(request.realDebridToken) : "")
  );
}

function peerflixBaseUrl(request: PlayResolveRequest): string {
  return resolvePeerflixBaseUrl({
    peerflixUrl: request.peerflixUrl,
    realDebridToken: request.realDebridToken,
  });
}

function libraryMatchResult(match: MediaItem, message: string): PlayResolveResult {
  const item = itemWithMappedPath(match);
  const streamUrl = item.filePath ? libraryStreamUrl(item.filePath) : item.streamUrl;

  return {
    source: item.filePath ? "library" : "plex",
    item,
    watchId: item.id,
    streamUrl,
    streamLabel: item.filePath ? "Local library" : "Plex",
    message,
  };
}

function tryLibraryDbMatch(request: PlayResolveRequest): PlayResolveResult | null {
  const db = readLibraryDatabase();
  if (!db?.items.length) return null;

  const match = findInPlexLibrary(db.items, {
    tmdbId: request.tmdbId,
    title: request.title,
    year: request.year,
    type: request.type,
  });
  if (!match) return null;

  return libraryMatchResult(match, "Playing from saved library (local file or Plex metadata)");
}

async function tryPlexMatch(request: PlayResolveRequest): Promise<PlayResolveResult | null> {
  const { tmdbId, title, year, type, plexUrl, plexToken } = request;
  if (!plexUrl || !plexToken) return null;

  try {
    const library = await fetchPlexLibrary(plexUrl, plexToken);
    const match = findInPlexLibrary(library, { tmdbId, title, year, type });
    if (!match) return null;

    const item = itemWithMappedPath(match);
    const streamUrl =
      item.filePath
        ? libraryStreamUrl(item.filePath)
        : match.streamUrl ??
          (match.plexPartKey ? plexDirectStreamUrl(match.plexPartKey, plexUrl) : undefined);

    return {
      source: item.filePath ? "library" : "plex",
      item,
      watchId: match.id,
      streamUrl,
      streamLabel: item.filePath ? "Local library" : "Plex",
      message: item.filePath
        ? "Playing from local library folder"
        : "Playing from your Plex library",
    };
  } catch (err) {
    console.warn("[play-resolve] Plex library check failed:", err);
    return tryLibraryDbMatch(request);
  }
}

async function fetchSortedTorrentStreams(request: PlayResolveRequest) {
  const imdbId = await resolveImdbId(request);
  const videoId = buildStreamVideoId({
    tmdbId: request.tmdbId,
    imdbId,
    type: request.type,
    season: request.season,
    episode: request.episode,
  });

  const lists: Array<{ streams: Awaited<ReturnType<typeof fetchTorrentioStreams>>; source: string }> =
    [];

  const torrentio = torrentioBaseUrl(request);
  if (torrentio) {
    try {
      const streams = await fetchTorrentioStreams(torrentio, request.type, videoId);
      lists.push({ streams, source: "Torrentio" });
    } catch (err) {
      console.warn("[play-resolve] Torrentio fetch failed:", err);
    }
  }

  const peerflix = peerflixBaseUrl(request);
  if (peerflix && peerflix !== torrentio) {
    try {
      const streams = await fetchStremioStreams(peerflix, request.type, videoId);
      lists.push({ streams, source: "Peerflix" });
    } catch (err) {
      console.warn("[play-resolve] Peerflix fetch failed:", err);
    }
  }

  if (lists.length === 0) return null;
  return mergeStremioStreamLists(lists);
}

export async function listPlaybackSources(
  request: PlayResolveRequest
): Promise<ListPlaybackSourcesResult> {
  const plex = await tryPlexMatch(request);
  if (plex?.item) {
    return {
      source: plex.source === "library" ? "library" : "plex",
      item: plex.item,
      watchId: plex.watchId,
      plexRatingKey: plex.item.plexRatingKey ?? plex.watchId?.replace("plex-", ""),
      message: plex.message,
    };
  }

  const cached = tryLibraryDbMatch(request);
  if (cached?.item) {
    return {
      source: cached.source === "library" ? "library" : "plex",
      item: cached.item,
      watchId: cached.watchId,
      plexRatingKey: cached.item.plexRatingKey ?? cached.watchId?.replace("plex-", ""),
      message: cached.message,
    };
  }

  if (request.plexOnly) {
    return {
      source: "none",
      message: "Not in your Plex library. Add it to Plex or turn off Plex-only mode in Settings.",
    };
  }

  if (!torrentioBaseUrl(request) && !peerflixBaseUrl(request)) {
    return {
      source: "none",
      message:
        "Not in Plex library. Configure Real-Debrid, Torrentio, or Peerflix for torrent fallback.",
    };
  }

  const item = await buildMediaItem(request);

  try {
    const listed = await fetchSortedTorrentStreams(request);
    if (!listed || listed.options.length === 0) {
      return {
        source: "none",
        item,
        message: "Not in Plex and no English torrents found.",
      };
    }

    return {
      source: "torrentio",
      item,
      watchId: item?.id,
      streams: listed.options,
      message: "Choose a stream source (English only)",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Torrent search failed";
    return { source: "none", item, message };
  }
}

export async function openTorrentioStreamByIndex(
  request: PlayResolveRequest,
  streamIndex: number
): Promise<OpenTorrentioStreamResult> {
  const listed = await fetchSortedTorrentStreams(request);
  if (!listed || listed.playable.length === 0) {
    throw new Error("No torrent streams available");
  }

  const stream = listed.playable[streamIndex];
  if (!stream?.url) {
    throw new Error("Invalid stream selection");
  }

  const item = await buildMediaItem(request);
  const directUrl = await resolveTorrentioStreamUrl(
    stream.url,
    request.realDebridToken
  );
  const { session, proxyPath } = registerStreamUrlIfLong(directUrl);
  const option = listed.options[streamIndex];

  return {
    item,
    streamUrl: proxyPath,
    streamSession: session,
    streamLabel: option?.label || stream.title || stream.name || "Torrent",
  };
}

export async function resolvePlayback(
  request: PlayResolveRequest
): Promise<PlayResolveResult> {
  const plex = await tryPlexMatch(request);
  if (plex) return plex;

  const cached = tryLibraryDbMatch(request);
  if (cached) return cached;

  if (request.plexOnly) {
    return {
      source: "none",
      message: "Not in your Plex library. Add it to Plex or turn off Plex-only mode in Settings.",
    };
  }

  if (!torrentioBaseUrl(request) && !peerflixBaseUrl(request)) {
    return {
      source: "none",
      message:
        "Not in Plex library. Configure Real-Debrid, Torrentio, or Peerflix for torrent fallback.",
    };
  }

  const item = await buildMediaItem(request);

  try {
    const opened = await openTorrentioStreamByIndex(request, 0);
    return {
      source: "torrentio",
      item: opened.item ?? item,
      watchId: item?.id,
      streamUrl: opened.streamUrl,
      streamLabel: opened.streamLabel,
      message: "Streaming via torrent addon + Real-Debrid",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Torrent search failed";
    return { source: "none", item, message };
  }
}

export function parsePlayResolveParams(params: URLSearchParams): PlayResolveRequest & {
  tmdbId?: number;
} {
  const tmdbIdParam = params.get("tmdbId");
  const tmdbId = tmdbIdParam ? parseInt(tmdbIdParam, 10) : undefined;

  return {
    tmdbId: tmdbIdParam && Number.isFinite(tmdbId) ? tmdbId : undefined,
    type: (params.get("type") ?? "movie") as "movie" | "series",
    season: params.get("season") ? parseInt(params.get("season")!, 10) : undefined,
    episode: params.get("episode") ? parseInt(params.get("episode")!, 10) : undefined,
    title: params.get("title") ?? undefined,
    year: params.get("year") ? parseInt(params.get("year")!, 10) : undefined,
  };
}
