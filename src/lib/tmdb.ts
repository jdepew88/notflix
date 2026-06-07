import type { MediaItem } from "./types";

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE = "https://image.tmdb.org/t/p";

export function posterUrl(path?: string, size: "w342" | "w500" | "w780" | "original" = "w500"): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http") || path.startsWith("/api/")) return path;
  return `${TMDB_IMAGE}/${size}${path}`;
}

export function backdropUrl(path?: string): string | undefined {
  return posterUrl(path, "original");
}

async function tmdbFetch<T>(path: string, apiKey: string): Promise<T> {
  const url = `${TMDB_BASE}${path}${path.includes("?") ? "&" : "?"}api_key=${apiKey}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`TMDB error: ${res.statusText}`);
  return res.json() as Promise<T>;
}

interface TmdbMovie {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  genre_ids: number[];
}

interface TmdbResponse {
  results: TmdbMovie[];
}

function toMediaItem(movie: TmdbMovie): MediaItem {
  return {
    id: `tmdb-${movie.id}`,
    tmdbId: movie.id,
    title: movie.title,
    overview: movie.overview,
    posterPath: movie.poster_path ?? undefined,
    backdropPath: movie.backdrop_path ?? undefined,
    releaseDate: movie.release_date,
    rating: movie.vote_average,
    genreIds: movie.genre_ids,
    type: "movie",
    source: "tmdb",
  };
}

export async function getTrending(apiKey: string): Promise<MediaItem[]> {
  const data = await tmdbFetch<TmdbResponse>("/trending/movie/week", apiKey);
  return data.results.map(toMediaItem);
}

export async function getPopular(apiKey: string): Promise<MediaItem[]> {
  const data = await tmdbFetch<TmdbResponse>("/movie/popular", apiKey);
  return data.results.map(toMediaItem);
}

export async function getTopRated(apiKey: string): Promise<MediaItem[]> {
  const data = await tmdbFetch<TmdbResponse>("/movie/top_rated", apiKey);
  return data.results.map(toMediaItem);
}

export async function getNowPlaying(apiKey: string): Promise<MediaItem[]> {
  const data = await tmdbFetch<TmdbResponse>("/movie/now_playing", apiKey);
  return data.results.map(toMediaItem);
}

export async function searchMovies(apiKey: string, query: string): Promise<MediaItem[]> {
  const data = await tmdbFetch<TmdbResponse>(
    `/search/movie?query=${encodeURIComponent(query)}`,
    apiKey
  );
  return data.results.map(toMediaItem);
}

export async function getMovieDetails(apiKey: string, id: number) {
  return tmdbFetch<
    TmdbMovie & {
      runtime: number;
      genres: Array<{ id: number; name: string }>;
      spoken_languages: Array<{ english_name: string }>;
    }
  >(`/movie/${id}`, apiKey);
}

export async function getMovieExternalIds(
  apiKey: string,
  id: number
): Promise<{ imdb_id: string | null }> {
  return tmdbFetch<{ imdb_id: string | null }>(`/movie/${id}/external_ids`, apiKey);
}

export async function getMovieVideos(apiKey: string, id: number): Promise<string | null> {
  const data = await tmdbFetch<{
    results: Array<{ key: string; site: string; type: string }>;
  }>(`/movie/${id}/videos`, apiKey);
  const trailer = data.results.find(
    (v) => v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser")
  );
  return trailer?.key ?? null;
}

export async function getSimilarMovies(apiKey: string, id: number): Promise<MediaItem[]> {
  const data = await tmdbFetch<TmdbResponse>(`/movie/${id}/similar`, apiKey);
  return data.results.map(toMediaItem);
}

export async function getGenres(apiKey: string): Promise<Array<{ id: number; name: string }>> {
  const data = await tmdbFetch<{ genres: Array<{ id: number; name: string }> }>(
    "/genre/movie/list",
    apiKey
  );
  return data.genres;
}

export async function getMoviesByGenre(
  apiKey: string,
  genreId: number,
  page = 1
): Promise<{ items: MediaItem[]; totalPages: number }> {
  const data = await tmdbFetch<TmdbResponse & { total_pages: number }>(
    `/discover/movie?with_genres=${genreId}&page=${page}&sort_by=popularity.desc`,
    apiKey
  );
  return { items: data.results.map(toMediaItem), totalPages: data.total_pages };
}

export async function enrichLibraryWithTmdb(
  items: MediaItem[],
  apiKey: string
): Promise<MediaItem[]> {
  const enriched = await Promise.all(
    items.slice(0, 10).map(async (item) => {
      try {
        const results = await searchMovies(apiKey, item.title);
        const match = results[0];
        if (!match) return item;
        return {
          ...item,
          overview: match.overview || item.overview,
          posterPath: match.posterPath,
          backdropPath: match.backdropPath,
          releaseDate: match.releaseDate || item.releaseDate,
          rating: match.rating,
        };
      } catch {
        return item;
      }
    })
  );
  return [...enriched, ...items.slice(10)];
}
