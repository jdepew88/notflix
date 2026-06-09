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
  addedAt?: number;
  parentRatingKey?: string;
  grandparentRatingKey?: string;
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

const PLEX_FETCH_TIMEOUT_MS = 45_000;

async function plexGet<T>(
  plexUrl: string,
  token: string,
  path: string
): Promise<T> {
  const url = `${normalizePlexUrl(plexUrl)}${path}${path.includes("?") ? "&" : "?"}X-Plex-Token=${token}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(PLEX_FETCH_TIMEOUT_MS),
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
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new Error(`Plex timed out reaching ${normalizePlexUrl(plexUrl)}`);
    }
    if (err instanceof TypeError && /fetch failed/i.test(err.message)) {
      throw new Error(
        `Plex unreachable at ${normalizePlexUrl(plexUrl)}. Use the server URL your container can reach (see PLEX_URL in .env) and Save & Sync.`
      );
    }
    throw err;
  }
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

import { mapHostPathToContainer } from "./library-path";

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

  const isEpisode = meta.type === "episode";
  const title =
    isEpisode && meta.grandparentTitle ? meta.grandparentTitle : meta.title;

  const seriesId = isEpisode
    ? meta.grandparentRatingKey
      ? `plex-${meta.grandparentRatingKey}`
      : undefined
    : meta.type === "show"
      ? `plex-${meta.ratingKey}`
      : meta.parentRatingKey
        ? `plex-${meta.parentRatingKey}`
        : undefined;

  return {
    id: `plex-${meta.ratingKey}`,
    title,
    episodeTitle: isEpisode ? meta.title : undefined,
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
    filePath: filePath ? mapHostPathToContainer(filePath) : undefined,
    plexPartKey: partKey,
    streamUrl: partKey
      ? plexDirectStreamUrl(partKey, plexUrl)
      : undefined,
    season: meta.parentIndex,
    episode: meta.index,
    seriesId,
    tmdbId,
    tvdbId,
    plexRatingKey: meta.ratingKey,
    genres: meta.Genre?.map((g) => g.tag).filter(Boolean) ?? [],
    libraryAddedAt: meta.addedAt,
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

export interface PlexFetchProgress {
  phase: "sections" | "metadata";
  message: string;
  sectionIndex: number;
  sectionCount: number;
  itemsLoaded: number;
}

export async function fetchPlexLibrary(
  plexUrl: string,
  token: string,
  onProgress?: (progress: PlexFetchProgress) => void
): Promise<MediaItem[]> {
  const sections = await plexGet<PlexMediaContainer>(
    plexUrl,
    token,
    "/library/sections"
  );

  const directories = (sections.MediaContainer?.Directory ?? []).filter((s) =>
    ["movie", "show"].includes(s.type)
  );
  const items: MediaItem[] = [];
  const sectionCount = directories.length;

  onProgress?.({
    phase: "sections",
    message: `Found ${sectionCount} Plex libraries`,
    sectionIndex: 0,
    sectionCount,
    itemsLoaded: 0,
  });

  for (let i = 0; i < directories.length; i++) {
    const section = directories[i];
    onProgress?.({
      phase: "metadata",
      message: `Loading ${section.title}…`,
      sectionIndex: i + 1,
      sectionCount,
      itemsLoaded: items.length,
    });

    const data = await plexGet<PlexMediaContainer>(
      plexUrl,
      token,
      `/library/sections/${section.key}/all?sort=addedAt:desc`
    );

    const metadata = data.MediaContainer?.Metadata ?? [];
    for (const meta of metadata) {
      const item = metadataToItem(meta, plexUrl, token, section.type);
      if (item) items.push(item);
    }

    if (section.type === "show") {
      onProgress?.({
        phase: "metadata",
        message: `Loading episodes from ${section.title}…`,
        sectionIndex: i + 1,
        sectionCount,
        itemsLoaded: items.length,
      });

      const episodesData = await plexGet<PlexMediaContainer>(
        plexUrl,
        token,
        `/library/sections/${section.key}/all?type=4&sort=addedAt:desc`
      );
      const episodes = episodesData.MediaContainer?.Metadata ?? [];
      for (const meta of episodes) {
        const item = metadataToItem(meta, plexUrl, token, "show");
        if (item) items.push(item);
      }
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
  featured?: boolean;
}> {
  const movies = items.filter((i) => i.type === "movie");
  const series = items.filter((i) => i.type === "series");
  const rows: Array<{ id: string; title: string; items: MediaItem[]; featured?: boolean }> = [];

  if (movies.length > 0) {
    rows.push({
      id: "plex-movies",
      title: "Movies",
      items: movies,
      featured: true,
    });
  }
  if (series.length > 0) {
    rows.push({
      id: "plex-shows",
      title: "TV Shows",
      items: series,
      featured: true,
    });
  }

  const recent = [...items]
    .filter((i) => i.type === "movie" || i.type === "series")
    .sort((a, b) => (b.libraryAddedAt ?? 0) - (a.libraryAddedAt ?? 0))
    .slice(0, 25);
  if (recent.length > 0) {
    rows.push({ id: "plex-recent", title: "Recently Added", items: recent });
  }

  const genreRows = buildGenreRows(items);
  rows.push(...genreRows);

  return rows;
}
