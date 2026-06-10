import { fetchPlexLibrary } from "./plex";
import { findInPlexLibrary, isEpisodePlaybackMatch } from "./plex-match";
import { plexDirectStreamUrl } from "./plex-stream";
import { readLibraryDatabase } from "./library-store";
import {
  itemWithMappedPath,
  libraryStreamUrl,
  resolveAccessibleLibraryFile,
} from "./library-playback";
import { resolveLibraryPath } from "./library-path";
import { resolvePeerflixBaseUrl } from "./peerflix";
import {
  buildDefaultTorrentioUrl,
  buildStreamVideoId,
  fetchTorrentioStreams,
  normalizeTorrentioBaseUrl,
  resolveTorrentioStreamUrl,
  type TorrentioStreamOption,
} from "./torrentio";
import {
  fetchStremioStreams,
  finalizeStremioAddonUrl,
  mergeStremioStreamLists,
} from "./stremio-streams";
import { registerStreamUrlIfLong } from "./stream-sessions";
import {
  getMovieDetails,
  getMovieExternalIds,
  getTvExternalIds,
  searchMovies,
  searchTv,
} from "./tmdb";
import { findLibraryEpisode } from "./episode-library";
import type { MediaItem } from "./types";

export interface PlayResolveRequest {
  tmdbId?: number;
  type: "movie" | "series";
  season?: number;
  episode?: number;
  title?: string;
  year?: number;
  seriesId?: string;
  plexUrl?: string;
  plexToken?: string;
  torrentioUrl?: string;
  peerflixUrl?: string;
  realDebridToken?: string;
  tmdbApiKey?: string;
  libraryPath?: string;
  plexOnly?: boolean;
  /** Skip Plex/library and search torrent addons only. */
  debridOnly?: boolean;
  /** Skip Plex/library lookup (download torrents only). */
  forceDebrid?: boolean;
  /** Return the Real-Debrid HTTPS link instead of the app proxy (for downloads). */
  forDownload?: boolean;
  /** Rank torrents for browser direct play (H.264 + AAC / MP4). */
  directPlayPreferred?: boolean;
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

function pickTmdbSearchResult(
  results: MediaItem[],
  request: PlayResolveRequest
): number | undefined {
  if (results.length === 0) return undefined;
  if (request.year) {
    const withYear = results.find((item) => {
      const y = item.releaseDate ? parseInt(item.releaseDate.slice(0, 4), 10) : undefined;
      return y === request.year;
    });
    if (withYear?.tmdbId) return withYear.tmdbId;
  }
  return results[0]?.tmdbId;
}

/** Resolve TMDB id from request, library DB, or title search when missing. */
export async function resolvePlayTmdbId(
  request: PlayResolveRequest
): Promise<number | undefined> {
  if (request.tmdbId) return request.tmdbId;

  const db = readLibraryDatabase();
  if (db?.items.length) {
    const match = findInPlexLibrary(db.items, {
      tmdbId: request.tmdbId,
      title: request.title,
      year: request.year,
      type: request.type,
      season: request.season,
      episode: request.episode,
      seriesId: request.seriesId,
    });
    if (match?.tmdbId) return match.tmdbId;

    if (request.type === "series" && request.title) {
      const show = db.items.find(
        (item) =>
          item.type === "series" &&
          item.tmdbId &&
          item.title.toLowerCase() === request.title!.toLowerCase()
      );
      if (show?.tmdbId) return show.tmdbId;
    }
  }

  if (!request.tmdbApiKey || !request.title?.trim()) return undefined;

  try {
    if (request.type === "series") {
      const results = await searchTv(request.tmdbApiKey, request.title);
      return pickTmdbSearchResult(results, request);
    }
    const results = await searchMovies(request.tmdbApiKey, request.title);
    return pickTmdbSearchResult(results, request);
  } catch {
    return undefined;
  }
}

export async function enrichPlayResolveRequest(
  request: PlayResolveRequest
): Promise<PlayResolveRequest> {
  const tmdbId = await resolvePlayTmdbId(request);
  if (!tmdbId || request.tmdbId === tmdbId) return request;
  return { ...request, tmdbId };
}

async function resolveImdbId(request: PlayResolveRequest): Promise<string | undefined> {
  const { tmdbApiKey, tmdbId, type } = request;
  if (!tmdbApiKey || !tmdbId) return undefined;
  try {
    if (type === "series") {
      const external = await getTvExternalIds(tmdbApiKey, tmdbId);
      return external.imdb_id ?? undefined;
    }
    const external = await getMovieExternalIds(tmdbApiKey, tmdbId);
    return external.imdb_id ?? undefined;
  } catch {
    return undefined;
  }
}

function torrentioBaseUrl(request: PlayResolveRequest): string {
  if (request.torrentioUrl?.trim()) {
    return finalizeStremioAddonUrl(request.torrentioUrl);
  }
  if (request.realDebridToken) {
    return buildDefaultTorrentioUrl(request.realDebridToken);
  }
  return "";
}

function peerflixBaseUrl(request: PlayResolveRequest): string {
  return resolvePeerflixBaseUrl({
    peerflixUrl: request.peerflixUrl,
    realDebridToken: request.realDebridToken,
  });
}

function libraryStreamForItem(
  item: MediaItem,
  libraryRoot: string
): { streamUrl?: string; source: "library" | "plex" } {
  if (item.filePath && resolveAccessibleLibraryFile(item.filePath, libraryRoot)) {
    return {
      streamUrl: libraryStreamUrl(item.filePath, libraryRoot),
      source: "library",
    };
  }
  if (item.plexPartKey && item.streamUrl) {
    return { streamUrl: item.streamUrl, source: "plex" };
  }
  return { streamUrl: item.streamUrl, source: item.filePath ? "library" : "plex" };
}

function libraryMatchResult(
  match: MediaItem,
  message: string,
  libraryRoot: string
): PlayResolveResult {
  const item = itemWithMappedPath(match, libraryRoot);
  const playback = libraryStreamForItem(item, libraryRoot);

  return {
    source: playback.source,
    item,
    watchId: item.id,
    streamUrl: playback.streamUrl,
    streamLabel: playback.source === "library" ? "Local library" : "Plex",
    message,
  };
}

function tryLibraryDbMatch(request: PlayResolveRequest): PlayResolveResult | null {
  const db = readLibraryDatabase();
  if (!db?.items.length) return null;
  const libraryRoot = resolveLibraryPath(request.libraryPath);

  if (request.type === "series" && request.season != null && request.episode != null) {
    const episode = findLibraryEpisode(db.items, {
      tmdbId: request.tmdbId,
      title: request.title,
      seriesId: request.seriesId,
      season: request.season,
      episode: request.episode,
    });
    if (episode && isEpisodePlaybackMatch(episode, request)) {
      return libraryMatchResult(
        episode,
        "Playing episode from saved library (local file or Plex metadata)",
        libraryRoot
      );
    }
    return null;
  }

  const match = findInPlexLibrary(db.items, {
    tmdbId: request.tmdbId,
    title: request.title,
    year: request.year,
    type: request.type,
    season: request.season,
    episode: request.episode,
    seriesId: request.seriesId,
  });
  if (!match || !isEpisodePlaybackMatch(match, request)) return null;

  return libraryMatchResult(
    match,
    "Playing from saved library (local file or Plex metadata)",
    libraryRoot
  );
}

async function tryPlexMatch(request: PlayResolveRequest): Promise<PlayResolveResult | null> {
  const { tmdbId, title, year, type, plexUrl, plexToken, seriesId } = request;
  if (!plexUrl || !plexToken) return null;

  try {
    const library = await fetchPlexLibrary(plexUrl, plexToken);
    const match = findInPlexLibrary(library, {
      tmdbId,
      title,
      year,
      type,
      season: request.season,
      episode: request.episode,
      seriesId,
    });
    if (!match || !isEpisodePlaybackMatch(match, request)) return null;

    const libraryRoot = resolveLibraryPath(request.libraryPath);
    const item = itemWithMappedPath(match, libraryRoot);
    const playback = libraryStreamForItem(
      {
        ...item,
        streamUrl:
          match.streamUrl ??
          (match.plexPartKey ? plexDirectStreamUrl(match.plexPartKey, plexUrl) : undefined),
      },
      libraryRoot
    );

    return {
      source: playback.source,
      item,
      watchId: match.id,
      streamUrl: playback.streamUrl,
      streamLabel: playback.source === "library" ? "Local library" : "Plex",
      message:
        playback.source === "library"
          ? "Playing from local library folder"
          : "Playing from your Plex library",
    };
  } catch (err) {
    console.warn("[play-resolve] Plex library check failed:", err);
    return tryLibraryDbMatch(request);
  }
}

async function fetchSortedTorrentStreams(request: PlayResolveRequest) {
  const resolved = await enrichPlayResolveRequest(request);
  const directPlayPreferred = Boolean(resolved.directPlayPreferred);
  const imdbId = await resolveImdbId(resolved);
  const videoId = buildStreamVideoId({
    tmdbId: resolved.tmdbId,
    imdbId,
    type: resolved.type,
    season: resolved.season,
    episode: resolved.episode,
  });

  const lists: Array<{ streams: Awaited<ReturnType<typeof fetchTorrentioStreams>>; source: string }> =
    [];

  const torrentio = torrentioBaseUrl(resolved);
  if (torrentio) {
    try {
      const streams = await fetchTorrentioStreams(torrentio, resolved.type, videoId);
      lists.push({ streams, source: "Torrentio" });
    } catch (err) {
      console.warn("[play-resolve] Torrentio fetch failed:", err);
    }
  }

  const peerflix = peerflixBaseUrl(resolved);
  if (peerflix && peerflix !== torrentio) {
    try {
      const streams = await fetchStremioStreams(peerflix, resolved.type, videoId);
      lists.push({ streams, source: "Peerflix" });
    } catch (err) {
      console.warn("[play-resolve] Peerflix fetch failed:", err);
    }
  }

  if (lists.length === 0) return null;
  return mergeStremioStreamLists(lists, { directPlayPreferred });
}

async function listDebridPlaybackSources(
  request: PlayResolveRequest
): Promise<ListPlaybackSourcesResult> {
  if (request.plexOnly) {
    return {
      source: "none",
      message: "Plex-only mode is on. Turn it off in Settings to search Real-Debrid.",
    };
  }

  if (!torrentioBaseUrl(request) && !peerflixBaseUrl(request)) {
    return {
      source: "none",
      message:
        "Configure Real-Debrid, Torrentio, or Peerflix in Settings to search torrent sources.",
    };
  }

  const enriched = await enrichPlayResolveRequest(request);
  const item = await buildMediaItem(enriched);

  try {
    const listed = await fetchSortedTorrentStreams({
      ...enriched,
      directPlayPreferred: enriched.directPlayPreferred ?? true,
    });
    if (!listed || listed.options.length === 0) {
      return {
        source: "none",
        item,
        message: "No English torrents found on Real-Debrid for this title.",
      };
    }

    return {
      source: "torrentio",
      item,
      watchId: item?.id,
      streams: listed.options,
      message: request.directPlayPreferred
        ? "Choose a direct-play friendly stream (H.264 + AAC preferred)"
        : "Choose a stream source (English only)",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Torrent search failed";
    return { source: "none", item, message };
  }
}

export async function listPlaybackSources(
  request: PlayResolveRequest
): Promise<ListPlaybackSourcesResult> {
  if (request.debridOnly) {
    return listDebridPlaybackSources(request);
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

  const enriched = await enrichPlayResolveRequest(request);
  const item = await buildMediaItem(enriched);

  try {
    const listed = await fetchSortedTorrentStreams(enriched);
    if (!listed || listed.options.length === 0) {
      return {
        source: "none",
        item,
        message: enriched.tmdbId
          ? "Not in Plex and no English torrents found."
          : "Not in Plex and could not resolve TMDB id for torrent search. Fix metadata via right-click → Fix metadata.",
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
  const enriched = await enrichPlayResolveRequest(request);
  const listed = await fetchSortedTorrentStreams({
    ...enriched,
    directPlayPreferred: enriched.directPlayPreferred ?? Boolean(enriched.debridOnly),
  });
  if (!listed || listed.playable.length === 0) {
    throw new Error("No torrent streams available");
  }

  const stream = listed.playable[streamIndex];
  if (!stream?.url) {
    throw new Error("Invalid stream selection");
  }

  const item = await buildMediaItem(enriched);
  const directUrl = await resolveTorrentioStreamUrl(stream.url, enriched.realDebridToken, {
    season: enriched.season,
    episode: enriched.episode,
  });
  const option = listed.options[streamIndex];
  const useDirectHttps = Boolean(enriched.forDownload);

  if (useDirectHttps) {
    return {
      item,
      streamUrl: directUrl,
      streamLabel: option?.label || stream.title || stream.name || "Torrent",
    };
  }

  const { session, proxyPath } = registerStreamUrlIfLong(directUrl);

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
  const cached = tryLibraryDbMatch(request);
  if (cached) return cached;

  const plex = await tryPlexMatch(request);
  if (plex) return plex;

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

  const enriched = await enrichPlayResolveRequest(request);
  const item = await buildMediaItem(enriched);

  try {
    const opened = await openTorrentioStreamByIndex(enriched, 0);
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
    seriesId: params.get("seriesId") ?? undefined,
    forceDebrid: params.get("forceDebrid") === "1",
  };
}

/** Torrent list for download when Plex/library is unavailable (or forced). */
export async function listTorrentDownloadSources(
  request: PlayResolveRequest
): Promise<ListPlaybackSourcesResult> {
  return listDebridPlaybackSources({
    ...request,
    directPlayPreferred: false,
    debridOnly: true,
  });
}
