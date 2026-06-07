import { fetchPlexLibrary } from "./plex";
import { findInPlexLibrary } from "./plex-match";
import { plexDirectStreamUrl } from "./plex-stream";
import {
  buildDefaultTorrentioUrl,
  buildStreamVideoId,
  fetchTorrentioStreams,
  normalizeTorrentioBaseUrl,
  pickBestTorrentioStream,
  resolveTorrentioStreamUrl,
} from "./torrentio";
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

export async function resolvePlayback(
  request: PlayResolveRequest
): Promise<PlayResolveResult> {
  const {
    tmdbId,
    type,
    season,
    episode,
    title,
    year,
    plexUrl,
    plexToken,
    torrentioUrl,
    realDebridToken,
    tmdbApiKey,
    plexOnly,
  } = request;

  if (plexUrl && plexToken) {
    try {
      const library = await fetchPlexLibrary(plexUrl, plexToken);
      const match = findInPlexLibrary(library, { tmdbId, title, year, type });

      if (match) {
        const streamUrl =
          match.streamUrl ??
          (match.plexPartKey
            ? plexDirectStreamUrl(match.plexPartKey, plexUrl)
            : undefined);

        return {
          source: "plex",
          item: match,
          watchId: match.id,
          streamUrl,
          streamLabel: "Plex",
          message: "Playing from your Plex library",
        };
      }
    } catch (err) {
      console.warn("[play-resolve] Plex library check failed:", err);
    }
  }

  if (plexOnly) {
    return {
      source: "none",
      message: "Not in your Plex library. Add it to Plex or turn off Plex-only mode in Settings.",
    };
  }

  const torrentioBase =
    (torrentioUrl && normalizeTorrentioBaseUrl(torrentioUrl)) ||
    (realDebridToken ? buildDefaultTorrentioUrl(realDebridToken) : "");

  if (!torrentioBase) {
    return {
      source: "none",
      message: "Not in Plex library. Configure Real-Debrid or TORRENTIO_URL for torrent fallback.",
    };
  }

  let imdbId: string | undefined;
  if (tmdbApiKey && tmdbId && type === "movie") {
    try {
      const external = await getMovieExternalIds(tmdbApiKey, tmdbId);
      imdbId = external.imdb_id ?? undefined;
    } catch {
      /* fallback to tmdb id */
    }
  }

  let item: MediaItem | undefined;
  if (tmdbApiKey && tmdbId && type === "movie") {
    try {
      const movie = await getMovieDetails(tmdbApiKey, tmdbId);
      item = {
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

  if (!item && tmdbId) {
    item = {
      id: `tmdb-${tmdbId}`,
      tmdbId,
      title: title ?? "Stream",
      releaseDate: year ? String(year) : undefined,
      type,
      source: "debrid",
    };
  }

  try {
    const videoId = buildStreamVideoId({ tmdbId, imdbId, type, season, episode });
    const streams = await fetchTorrentioStreams(torrentioBase, type, videoId);
    const best = pickBestTorrentioStream(streams);

    if (!best?.url) {
      return {
        source: "none",
        item,
        message: "Not in Plex and no cached torrents found on Real-Debrid.",
      };
    }

    const directUrl = await resolveTorrentioStreamUrl(best.url);
    const proxied = `/api/proxy/stream?url=${encodeURIComponent(directUrl)}`;

    return {
      source: "torrentio",
      item,
      watchId: item?.id,
      streamUrl: proxied,
      streamLabel: best.title || best.name || "Real-Debrid",
      message: "Streaming via Torrentio + Real-Debrid",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Torrent search failed";
    return { source: "none", item, message };
  }
}
