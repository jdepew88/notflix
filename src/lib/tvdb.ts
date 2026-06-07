import type { MediaItem } from "./types";

const TVDB_BASE = "https://api4.thetvdb.com/v4";

let cachedToken: { token: string; expires: number } | null = null;

async function getTvdbToken(apiKey: string): Promise<string> {
  if (cachedToken && cachedToken.expires > Date.now()) {
    return cachedToken.token;
  }

  const res = await fetch(`${TVDB_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apikey: apiKey }),
  });

  if (!res.ok) throw new Error(`TVDB login failed: ${res.statusText}`);
  const data = (await res.json()) as { data: { token: string } };
  cachedToken = {
    token: data.data.token,
    expires: Date.now() + 23 * 60 * 60 * 1000,
  };
  return cachedToken.token;
}

async function tvdbFetch<T>(path: string, apiKey: string): Promise<T> {
  const token = await getTvdbToken(apiKey);
  const res = await fetch(`${TVDB_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    next: { revalidate: 86400 },
  });
  if (!res.ok) throw new Error(`TVDB error: ${res.statusText}`);
  return res.json() as Promise<T>;
}

interface TvdbSearchResult {
  data: Array<{
    tvdb_id: string;
    name: string;
    image_url?: string;
    overview?: string;
    type: string;
  }>;
}

interface TvdbSeriesExtended {
  data: {
    name: string;
    overview?: string;
    image?: string;
    artworks?: Array<{ type: number; image: string }>;
    genres?: Array<{ name: string }>;
    status?: { name: string };
  };
}

interface TvdbMovieExtended {
  data: {
    name: string;
    overview?: string;
    image?: string;
    artworks?: Array<{ type: number; image: string }>;
    genres?: Array<{ name: string }>;
  };
}

export async function searchTvdb(
  apiKey: string,
  query: string,
  type?: "series" | "movie"
): Promise<Array<{ id: number; name: string; image?: string; overview?: string }>> {
  const typeParam = type ? `&type=${type}` : "";
  const data = await tvdbFetch<TvdbSearchResult>(
    `/search?query=${encodeURIComponent(query)}${typeParam}`,
    apiKey
  );
  return data.data.map((r) => ({
    id: parseInt(r.tvdb_id, 10),
    name: r.name,
    image: r.image_url,
    overview: r.overview,
  }));
}

export async function getTvdbSeries(apiKey: string, id: number) {
  return tvdbFetch<TvdbSeriesExtended>(`/series/${id}/extended`, apiKey);
}

export async function getTvdbMovie(apiKey: string, id: number) {
  return tvdbFetch<TvdbMovieExtended>(`/movies/${id}/extended`, apiKey);
}

function pickArtwork(artworks?: Array<{ type: number; image: string }>) {
  if (!artworks) return {};
  const poster = artworks.find((a) => a.type === 2)?.image;
  const banner = artworks.find((a) => a.type === 1)?.image;
  return { poster, banner };
}

export async function enrichWithTvdb(
  items: MediaItem[],
  apiKey: string
): Promise<MediaItem[]> {
  const enriched = await Promise.all(
    items.map(async (item) => {
      try {
        if (item.tvdbId) {
          if (item.type === "series" || item.type === "episode") {
            const data = await getTvdbSeries(apiKey, item.tvdbId);
            const art = pickArtwork(data.data.artworks);
            return {
              ...item,
              title: data.data.name || item.title,
              overview: data.data.overview || item.overview,
              posterPath: item.posterPath || art.poster || data.data.image,
              backdropPath: item.backdropPath || art.banner,
              genres: data.data.genres?.map((g) => g.name) ?? item.genres,
            };
          }
          const data = await getTvdbMovie(apiKey, item.tvdbId);
          const art = pickArtwork(data.data.artworks);
          return {
            ...item,
            title: data.data.name || item.title,
            overview: data.data.overview || item.overview,
            posterPath: item.posterPath || art.poster || data.data.image,
            backdropPath: item.backdropPath || art.banner,
            genres: data.data.genres?.map((g) => g.name) ?? item.genres,
          };
        }

        const searchType = item.type === "movie" ? "movie" : "series";
        const results = await searchTvdb(apiKey, item.title, searchType);
        const match = results[0];
        if (!match) return item;

        return {
          ...item,
          tvdbId: match.id,
          overview: match.overview || item.overview,
          posterPath: item.posterPath || match.image,
        };
      } catch {
        return item;
      }
    })
  );
  return enriched;
}

export async function testTvdbConnection(
  apiKey: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await getTvdbToken(apiKey);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }
}
