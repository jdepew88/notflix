import { fetchPlexLibrary } from "./plex";
import { findInPlexLibrary } from "./plex-match";
import { plexDirectStreamUrl } from "./plex-stream";
import {
  buildDefaultTorrentioUrl,
  buildStreamVideoId,
  fetchTorrentioStreams,
  listPlayableTorrentioStreams,
  normalizeTorrentioBaseUrl,
  resolveTorrentioStreamUrl,
  type TorrentioStreamOption,
} from "./torrentio";
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
  realDebridToken?: string;
  tmdbApiKey?: string;
  plexOnly?: boolean;
}

export interface PlayResolveResult {
  source: "plex" | "torrentio" | "none";
  item?: MediaItem;
  watchId?: string;
  streamUrl?: string;
  streamLabel?: string;
  message?: string;
}

export interface ListPlaybackSourcesResult {
  source: "plex" | "torrentio" | "none";
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

async function tryPlexMatch(request: PlayResolveRequest): Promise<PlayResolveResult | null> {
  const { tmdbId, title, year, type, plexUrl, plexToken } = request;
  if (!plexUrl || !plexToken) return null;

  try {
    const library = await fetchPlexLibrary(plexUrl, plexToken);
    const match = findInPlexLibrary(library, { tmdbId, title, year, type });
    if (!match) return null;

    const streamUrl =
      match.streamUrl ??
      (match.plexPartKey ? plexDirectStreamUrl(match.plexPartKey, plexUrl) : undefined);

    return {
      source: "plex",
      item: match,
      watchId: match.id,
      streamUrl,
      streamLabel: "Plex",
      message: "Playing from your Plex library",
    };
  } catch (err) {
    console.warn("[play-resolve] Plex library check failed:", err);
    return null;
  }
}

async function fetchSortedTorrentioStreams(request: PlayResolveRequest) {
  const base = torrentioBaseUrl(request);
  if (!base) return null;

  const imdbId = await resolveImdbId(request);
  const videoId = buildStreamVideoId({
    tmdbId: request.tmdbId,
    imdbId,
    type: request.type,
    season: request.season,
    episode: request.episode,
  });

  const streams = await fetchTorrentioStreams(base, request.type, videoId);
  return listPlayableTorrentioStreams(streams);
}

export async function listPlaybackSources(
  request: PlayResolveRequest
): Promise<ListPlaybackSourcesResult> {
  const plex = await tryPlexMatch(request);
  if (plex?.item) {
    return {
      source: "plex",
      item: plex.item,
      watchId: plex.watchId,
      plexRatingKey: plex.item.plexRatingKey ?? plex.watchId?.replace("plex-", ""),
      message: plex.message,
    };
  }

  if (request.plexOnly) {
    return {
      source: "none",
      message: "Not in your Plex library. Add it to Plex or turn off Plex-only mode in Settings.",
    };
  }

  if (!torrentioBaseUrl(request)) {
    return {
      source: "none",
      message: "Not in Plex library. Configure Real-Debrid or TORRENTIO_URL for torrent fallback.",
    };
  }

  const item = await buildMediaItem(request);

  try {
    const listed = await fetchSortedTorrentioStreams(request);
    if (!listed || listed.options.length === 0) {
      return {
        source: "none",
        item,
        message: "Not in Plex and no cached torrents found on Real-Debrid.",
      };
    }

    return {
      source: "torrentio",
      item,
      watchId: item?.id,
      streams: listed.options,
      message: "Choose a stream source",
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
  const listed = await fetchSortedTorrentioStreams(request);
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
    streamLabel: option?.label || stream.title || stream.name || "Real-Debrid",
  };
}

export async function resolvePlayback(
  request: PlayResolveRequest
): Promise<PlayResolveResult> {
  const plex = await tryPlexMatch(request);
  if (plex) return plex;

  if (request.plexOnly) {
    return {
      source: "none",
      message: "Not in your Plex library. Add it to Plex or turn off Plex-only mode in Settings.",
    };
  }

  if (!torrentioBaseUrl(request)) {
    return {
      source: "none",
      message: "Not in Plex library. Configure Real-Debrid or TORRENTIO_URL for torrent fallback.",
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
      message: "Streaming via Torrentio + Real-Debrid",
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
