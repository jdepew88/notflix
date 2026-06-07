import type { MediaItem } from "./types";

export interface HomeTmdbRowDef {
  id: string;
  title: string;
  catalogType: string;
  page: number;
}

/** Initial TMDB rows loaded with the library on first paint. */
export const HOME_TMDB_ROWS_INITIAL: HomeTmdbRowDef[] = [
  { id: "tmdb-trending-movies", title: "Trending Movies", catalogType: "trending", page: 1 },
  { id: "tmdb-trending-tv", title: "Trending TV Shows", catalogType: "trending_tv", page: 1 },
  { id: "tmdb-popular-movies", title: "Popular Movies", catalogType: "popular", page: 1 },
  { id: "tmdb-popular-tv", title: "Popular TV Shows", catalogType: "popular_tv", page: 1 },
  { id: "tmdb-now-playing", title: "In Theaters", catalogType: "now_playing", page: 1 },
  { id: "tmdb-on-air", title: "TV On The Air", catalogType: "on_the_air", page: 1 },
];

/** Additional rows fetched as the user scrolls down the home page. */
export const HOME_TMDB_ROWS_MORE: HomeTmdbRowDef[] = [
  { id: "tmdb-airing-today", title: "Airing Today", catalogType: "airing_today", page: 1 },
  { id: "tmdb-top-rated-movies", title: "Top Rated Movies", catalogType: "top_rated", page: 1 },
  { id: "tmdb-top-rated-tv", title: "Top Rated TV Shows", catalogType: "top_rated_tv", page: 1 },
  { id: "tmdb-trending-movies-p2", title: "Trending Movies — More", catalogType: "trending", page: 2 },
  { id: "tmdb-trending-tv-p2", title: "Trending TV — More", catalogType: "trending_tv", page: 2 },
  { id: "tmdb-popular-movies-p2", title: "Popular Movies — More", catalogType: "popular", page: 2 },
  { id: "tmdb-popular-tv-p2", title: "Popular TV — More", catalogType: "popular_tv", page: 2 },
  { id: "tmdb-now-playing-p2", title: "In Theaters — More", catalogType: "now_playing", page: 2 },
  { id: "tmdb-on-air-p2", title: "TV On The Air — More", catalogType: "on_the_air", page: 2 },
  { id: "tmdb-trending-movies-p3", title: "Trending Movies — Discover", catalogType: "trending", page: 3 },
  { id: "tmdb-trending-tv-p3", title: "Trending TV — Discover", catalogType: "trending_tv", page: 3 },
  { id: "tmdb-popular-movies-p3", title: "Popular Movies — Discover", catalogType: "popular", page: 3 },
  { id: "tmdb-popular-tv-p3", title: "Popular TV — Discover", catalogType: "popular_tv", page: 3 },
];

export async function fetchHomeTmdbRow(
  def: HomeTmdbRowDef,
  settings: { tmdbApiKey?: string },
  fetchFn: (url: string, settings: { tmdbApiKey?: string }) => Promise<Response>
): Promise<{ id: string; title: string; items: MediaItem[] } | null> {
  if (!settings.tmdbApiKey) return null;

  const res = await fetchFn(
    `/api/catalog?type=${encodeURIComponent(def.catalogType)}&page=${def.page}`,
    settings
  );
  if (!res.ok) return null;

  const data = await res.json();
  if (!data.items?.length) return null;

  return { id: def.id, title: def.title, items: data.items as MediaItem[] };
}
