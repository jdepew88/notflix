import type { MediaItem } from "./types";
import { plexDirectStreamUrl } from "./plex-stream";

interface PlexMediaContainer {
  MediaContainer?: {
    size?: number;
    Directory?: PlexDirectory[];
    Metadata?: PlexMetadata[];
  };
}

interface PlexDirectory {
  key: string;
  title: string;
  type: string;
}

interface PlexMetadata {
  ratingKey: string;
  key: string;
  type: string;
  title: string;
  summary?: string;
  thumb?: string;
  art?: string;
  year?: number;
  duration?: number;
  guid?: string;
  parentRatingKey?: string;
  grandparentTitle?: string;
  parentIndex?: number;
  index?: number;
  Genre?: Array<{ tag: string }>;
  Media?: Array<{
    Part?: Array<{
      key: string;
      file?: string;
    }>;
  }>;
}

function normalizePlexUrl(url: string): string {
  return url.replace(/\/$/, "");
}

async function plexGet<T>(
  plexUrl: string,
  token: string,
  path: string
): Promise<T> {
  const url = `${normalizePlexUrl(plexUrl)}${path}${path.includes("?") ? "&" : "?"}X-Plex-Token=${token}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 300 },
  });
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error(
        "Plex API error: 401 Unauthorized — sign in with Plex in Settings to refresh your token."
      );
    }
    throw new Error(`Plex API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export function parseGuidIds(guid?: string): { tvdbId?: number; tmdbId?: number } {
  if (!guid) return {};
  const tvdb = guid.match(/thetvdb:\/\/(\d+)/i);
  const tmdb = guid.match(/tmdb:\/\/(\d+)/i);
  return {
    tvdbId: tvdb ? parseInt(tvdb[1], 10) : undefined,
    tmdbId: tmdb ? parseInt(tmdb[1], 10) : undefined,
  };
}

export function plexArtUrl(plexUrl: string, path: string): string {
  return `/api/plex/art?path=${encodeURIComponent(path)}&plexUrl=${encodeURIComponent(normalizePlexUrl(plexUrl))}`;
}

function metadataToItem(
  meta: PlexMetadata,
  plexUrl: string,
  token: string,
  sectionType: string
): MediaItem | null {
  const partKey = meta.Media?.[0]?.Part?.[0]?.key;
  const filePath = meta.Media?.[0]?.Part?.[0]?.file;
  const { tvdbId, tmdbId } = parseGuidIds(meta.guid);

  let type: MediaItem["type"] = "movie";
  if (meta.type === "show" || sectionType === "show") type = "series";
  if (meta.type === "episode") type = "episode";

  if (meta.type === "season") return null;

  const title =
    meta.type === "episode" && meta.grandparentTitle
      ? meta.grandparentTitle
      : meta.title;

  return {
    id: `plex-${meta.ratingKey}`,
    title,
    overview: meta.summary,
    posterPath: meta.thumb
      ? plexArtUrl(plexUrl, meta.thumb)
      : undefined,
    backdropPath: meta.art ? plexArtUrl(plexUrl, meta.art) : undefined,
    releaseDate: meta.year ? String(meta.year) : undefined,
    runtime: meta.duration ? Math.round(meta.duration / 60000) : undefined,
    type,
    mediaType:
      tmdbId && (type === "movie" || type === "series")
        ? type === "series"
          ? "tv"
          : "movie"
        : undefined,
    source: "library",
    filePath,
    plexPartKey: partKey,
    streamUrl: partKey
      ? plexDirectStreamUrl(partKey, plexUrl)
      : undefined,
    season: meta.parentIndex,
    episode: meta.index,
    seriesId: meta.parentRatingKey ? `plex-${meta.parentRatingKey}` : undefined,
    tmdbId,
    tvdbId,
    plexRatingKey: meta.ratingKey,
    genres: meta.Genre?.map((g) => g.tag).filter(Boolean) ?? [],
  };
}

export async function refreshPlexLibraries(
  plexUrl: string,
  token: string
): Promise<{ sections: number; names: string[] }> {
  const sections = await plexGet<PlexMediaContainer>(
    plexUrl,
    token,
    "/library/sections"
  );
  const directories = sections.MediaContainer?.Directory ?? [];
  const names: string[] = [];
  let count = 0;

  for (const section of directories) {
    if (!["movie", "show"].includes(section.type)) continue;
    const url = `${normalizePlexUrl(plexUrl)}/library/sections/${section.key}/refresh?X-Plex-Token=${token}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.ok) {
      count++;
      names.push(section.title);
    }
  }

  return { sections: count, names };
}

export async function fetchPlexLibrary(
  plexUrl: string,
  token: string
): Promise<MediaItem[]> {
  const sections = await plexGet<PlexMediaContainer>(
    plexUrl,
    token,
    "/library/sections"
  );

  const directories = sections.MediaContainer?.Directory ?? [];
  const items: MediaItem[] = [];

  for (const section of directories) {
    if (!["movie", "show"].includes(section.type)) continue;

    const data = await plexGet<PlexMediaContainer>(
      plexUrl,
      token,
      `/library/sections/${section.key}/all`
    );

    const metadata = data.MediaContainer?.Metadata ?? [];
    for (const meta of metadata) {
      const item = metadataToItem(meta, plexUrl, token, section.type);
      if (item) items.push(item);
    }
  }

  return items;
}

export async function getPlexItem(
  plexUrl: string,
  token: string,
  ratingKey: string
): Promise<MediaItem | null> {
  const data = await plexGet<PlexMediaContainer>(
    plexUrl,
    token,
    `/library/metadata/${ratingKey}`
  );
  const meta = data.MediaContainer?.Metadata?.[0];
  if (!meta) return null;
  return metadataToItem(meta, plexUrl, token, meta.type);
}

export async function testPlexConnection(
  plexUrl: string,
  token: string
): Promise<{ ok: boolean; serverName?: string; error?: string }> {
  try {
    const data = await plexGet<{ MediaContainer?: { friendlyName?: string } }>(
      plexUrl,
      token,
      "/"
    );
    return { ok: true, serverName: data.MediaContainer?.friendlyName };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }
}

export function filterByGenre(items: MediaItem[], genre: string): MediaItem[] {
  const needle = genre.trim().toLowerCase();
  if (!needle) return items;
  return items.filter((item) =>
    item.genres?.some((g) => g.toLowerCase() === needle || g.toLowerCase().includes(needle))
  );
}

export function collectGenres(items: MediaItem[]): string[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const genre of item.genres ?? []) {
      counts.set(genre, (counts.get(genre) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
}

function buildGenreRows(items: MediaItem[]): Array<{ id: string; title: string; items: MediaItem[] }> {
  const playable = items.filter((i) => i.type === "movie" || i.type === "series");
  const genreMap = new Map<string, MediaItem[]>();

  for (const item of playable) {
    for (const genre of item.genres ?? []) {
      const list = genreMap.get(genre) ?? [];
      if (!list.some((i) => i.id === item.id)) list.push(item);
      genreMap.set(genre, list);
    }
  }

  return [...genreMap.entries()]
    .filter(([, genreItems]) => genreItems.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 12)
    .map(([genre, genreItems]) => ({
      id: `plex-genre-${genre.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      title: genre,
      items: genreItems.slice(0, 25),
    }));
}

export function buildContentRowsFromPlex(items: MediaItem[]): Array<{
  id: string;
  title: string;
  items: MediaItem[];
}> {
  const movies = items.filter((i) => i.type === "movie");
  const series = items.filter((i) => i.type === "series");
  const rows: Array<{ id: string; title: string; items: MediaItem[] }> = [];

  const genreRows = buildGenreRows(items);
  rows.push(...genreRows);

  if (movies.length > 0) {
    rows.push({ id: "plex-movies", title: "Movies", items: movies });
  }
  if (series.length > 0) {
    rows.push({ id: "plex-shows", title: "TV Shows", items: series });
  }

  return rows;
}
