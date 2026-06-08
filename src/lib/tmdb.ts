import type { MediaItem, TmdbMediaType, WatchProvider, WatchProvidersByType } from "./types";

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

export function providerLogoUrl(path?: string, size: "w45" | "w92" = "w45"): string | undefined {
  if (!path) return undefined;
  return `${TMDB_IMAGE}/${size}${path}`;
}

export function resolveTmdbMediaType(item: MediaItem): TmdbMediaType | null {
  if (item.mediaType) return item.mediaType;
  if (item.type === "movie") return "movie";
  if (item.type === "series") return "tv";
  return null;
}

interface TmdbProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
}

interface TmdbWatchProvidersResponse {
  results: Record<
    string,
    {
      flatrate?: TmdbProvider[];
      rent?: TmdbProvider[];
      buy?: TmdbProvider[];
    }
  >;
}

function mapWatchProviders(list?: TmdbProvider[]): WatchProvider[] {
  if (!list?.length) return [];
  return list.map((p) => ({
    id: p.provider_id,
    name: p.provider_name,
    logoPath: p.logo_path ?? undefined,
  }));
}

export async function getWatchProviders(
  tmdbId: number,
  mediaType: TmdbMediaType,
  apiKey: string,
  country = "US"
): Promise<WatchProvidersByType> {
  const path =
    mediaType === "movie"
      ? `/movie/${tmdbId}/watch/providers`
      : `/tv/${tmdbId}/watch/providers`;
  const data = await tmdbFetch<TmdbWatchProvidersResponse>(path, apiKey);
  const region = data.results[country.toUpperCase()] ?? data.results[country];
  return {
    flatrate: mapWatchProviders(region?.flatrate),
    rent: mapWatchProviders(region?.rent),
    buy: mapWatchProviders(region?.buy),
  };
}

function watchProviderCacheKey(tmdbId: number, mediaType: TmdbMediaType): string {
  return `${mediaType}:${tmdbId}`;
}

export async function enrichItemsWithWatchProviders(
  items: MediaItem[],
  apiKey: string,
  country = "US"
): Promise<MediaItem[]> {
  const targets = new Map<string, { tmdbId: number; mediaType: TmdbMediaType }>();

  for (const item of items) {
    const mediaType = resolveTmdbMediaType(item);
    if (item.tmdbId && mediaType) {
      targets.set(watchProviderCacheKey(item.tmdbId, mediaType), {
        tmdbId: item.tmdbId,
        mediaType,
      });
    }
  }

  if (targets.size === 0) return items;

  const providerCache = new Map<string, WatchProvidersByType>();
  const entries = [...targets.entries()];

  const batchSize = 8;
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async ([key, { tmdbId, mediaType }]) => {
        try {
          const providers = await getWatchProviders(tmdbId, mediaType, apiKey, country);
          providerCache.set(key, providers);
        } catch {
          providerCache.set(key, { flatrate: [], rent: [], buy: [] });
        }
      })
    );
  }

  return items.map((item) => {
    const mediaType = resolveTmdbMediaType(item);
    if (!item.tmdbId || !mediaType) return item;
    const providers = providerCache.get(watchProviderCacheKey(item.tmdbId, mediaType));
    if (!providers) return { ...item, mediaType };
    return { ...item, mediaType, watchProviders: providers };
  });
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
  total_pages?: number;
}

interface TmdbTv {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  vote_average: number;
  genre_ids: number[];
}

interface TmdbTvResponse {
  results: TmdbTv[];
  total_pages?: number;
}

function toMediaItem(movie: TmdbMovie): MediaItem {
  return {
    id: `tmdb-${movie.id}`,
    tmdbId: movie.id,
    mediaType: "movie",
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

function toTvMediaItem(show: TmdbTv): MediaItem {
  return {
    id: `tmdb-tv-${show.id}`,
    tmdbId: show.id,
    mediaType: "tv",
    title: show.name,
    overview: show.overview,
    posterPath: show.poster_path ?? undefined,
    backdropPath: show.backdrop_path ?? undefined,
    releaseDate: show.first_air_date,
    rating: show.vote_average,
    genreIds: show.genre_ids,
    type: "series",
    source: "tmdb",
  };
}

export async function getTrending(apiKey: string, page = 1): Promise<MediaItem[]> {
  const data = await tmdbFetch<TmdbResponse>(`/trending/movie/week?page=${page}`, apiKey);
  return data.results.map(toMediaItem);
}

export async function getTrendingTv(apiKey: string, page = 1): Promise<MediaItem[]> {
  const data = await tmdbFetch<TmdbTvResponse>(`/trending/tv/week?page=${page}`, apiKey);
  return data.results.map(toTvMediaItem);
}

export async function getPopular(apiKey: string, page = 1): Promise<MediaItem[]> {
  const data = await tmdbFetch<TmdbResponse>(`/movie/popular?page=${page}`, apiKey);
  return data.results.map(toMediaItem);
}

export async function getPopularTv(apiKey: string, page = 1): Promise<MediaItem[]> {
  const data = await tmdbFetch<TmdbTvResponse>(`/tv/popular?page=${page}`, apiKey);
  return data.results.map(toTvMediaItem);
}

export async function getTopRated(apiKey: string, page = 1): Promise<MediaItem[]> {
  const data = await tmdbFetch<TmdbResponse>(`/movie/top_rated?page=${page}`, apiKey);
  return data.results.map(toMediaItem);
}

export async function getTopRatedTv(apiKey: string, page = 1): Promise<MediaItem[]> {
  const data = await tmdbFetch<TmdbTvResponse>(`/tv/top_rated?page=${page}`, apiKey);
  return data.results.map(toTvMediaItem);
}

export async function getNowPlaying(apiKey: string, page = 1): Promise<MediaItem[]> {
  const data = await tmdbFetch<TmdbResponse>(`/movie/now_playing?page=${page}`, apiKey);
  return data.results.map(toMediaItem);
}

export async function getOnTheAir(apiKey: string, page = 1): Promise<MediaItem[]> {
  const data = await tmdbFetch<TmdbTvResponse>(`/tv/on_the_air?page=${page}`, apiKey);
  return data.results.map(toTvMediaItem);
}

export async function getAiringToday(apiKey: string, page = 1): Promise<MediaItem[]> {
  const data = await tmdbFetch<TmdbTvResponse>(`/tv/airing_today?page=${page}`, apiKey);
  return data.results.map(toTvMediaItem);
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

export async function getTvExternalIds(
  apiKey: string,
  id: number
): Promise<{ imdb_id: string | null }> {
  return tmdbFetch<{ imdb_id: string | null }>(`/tv/${id}/external_ids`, apiKey);
}

export async function getTvDetails(apiKey: string, id: number) {
  return tmdbFetch<{
    id: number;
    name: string;
    overview: string;
    poster_path: string | null;
    backdrop_path: string | null;
    first_air_date: string;
    vote_average: number;
    number_of_seasons: number;
    seasons: Array<{
      season_number: number;
      episode_count: number;
      name: string;
      poster_path: string | null;
    }>;
    genres: Array<{ id: number; name: string }>;
  }>(`/tv/${id}`, apiKey);
}

export async function getTvSeasonEpisodes(apiKey: string, tvId: number, season: number) {
  return tmdbFetch<{
    episodes: Array<{
      season_number: number;
      episode_number: number;
      name: string;
      overview: string;
      still_path: string | null;
      air_date: string;
      runtime: number | null;
    }>;
  }>(`/tv/${tvId}/season/${season}`, apiKey);
}

export function tmdbSeasonsToGroups(
  seasons: Array<{
    season_number: number;
    episode_count: number;
    name: string;
    poster_path: string | null;
  }>
): Array<{ season: number; episodeCount: number; name: string; posterPath?: string }> {
  return seasons
    .filter((s) => s.season_number > 0)
    .map((s) => ({
      season: s.season_number,
      episodeCount: s.episode_count,
      name: s.name,
      posterPath: s.poster_path ?? undefined,
    }));
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

export async function getTvVideos(apiKey: string, id: number): Promise<string | null> {
  const data = await tmdbFetch<{
    results: Array<{ key: string; site: string; type: string }>;
  }>(`/tv/${id}/videos`, apiKey);
  const trailer = data.results.find(
    (v) => v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser")
  );
  return trailer?.key ?? null;
}

export async function getSimilarTv(apiKey: string, id: number): Promise<MediaItem[]> {
  const data = await tmdbFetch<TmdbTvResponse>(`/tv/${id}/similar`, apiKey);
  return data.results.map(toTvMediaItem);
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
