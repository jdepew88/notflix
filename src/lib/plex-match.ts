import type { MediaItem } from "./types";

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function releaseYear(releaseDate?: string): number | undefined {
  if (!releaseDate) return undefined;
  const year = parseInt(releaseDate.slice(0, 4), 10);
  return Number.isFinite(year) ? year : undefined;
}

function episodeBelongsToShow(
  episode: MediaItem,
  items: MediaItem[],
  query: {
    tmdbId?: number;
    title?: string;
    seriesId?: string;
  }
): boolean {
  const normalizedTitle = query.title ? normalizeTitle(query.title) : undefined;

  if (query.seriesId) {
    if (episode.seriesId === query.seriesId) return true;
    if (episode.id === query.seriesId) return true;
  }

  if (query.tmdbId) {
    if (episode.tmdbId === query.tmdbId) return true;
    const show = items.find(
      (item) =>
        item.type === "series" &&
        item.tmdbId === query.tmdbId &&
        episode.seriesId === item.id
    );
    if (show) return true;
  }

  if (normalizedTitle && normalizeTitle(episode.title) === normalizedTitle) {
    return true;
  }

  return false;
}

function findEpisodeInLibrary(
  items: MediaItem[],
  query: {
    tmdbId?: number;
    title?: string;
    seriesId?: string;
    season: number;
    episode: number;
  }
): MediaItem | null {
  const match = items.find((item) => {
    if (item.type !== "episode") return false;
    if (item.season !== query.season || item.episode !== query.episode) return false;
    return episodeBelongsToShow(item, items, query);
  });
  return match ?? null;
}

export function findInPlexLibrary(
  items: MediaItem[],
  query: {
    tmdbId?: number;
    title?: string;
    year?: number;
    type?: "movie" | "series" | "episode";
    season?: number;
    episode?: number;
    seriesId?: string;
  }
): MediaItem | null {
  const { tmdbId, title, year, type, season, episode, seriesId } = query;

  if (season != null && episode != null) {
    const episodeMatch = findEpisodeInLibrary(items, {
      tmdbId,
      title,
      seriesId,
      season,
      episode,
    });
    if (episodeMatch) return episodeMatch;
    return null;
  }

  if (seriesId) {
    const bySeriesId = items.find(
      (item) =>
        item.id === seriesId &&
        (item.type === "series" || item.type === "episode")
    );
    if (bySeriesId) return bySeriesId;
  }

  if (tmdbId) {
    const byTmdb = items.find(
      (item) =>
        item.tmdbId === tmdbId &&
        (!type ||
          item.type === type ||
          (type === "movie" && item.type === "movie") ||
          (type === "series" && item.type === "series"))
    );
    if (byTmdb) return byTmdb;
  }

  if (!title) return null;

  const needle = normalizeTitle(title);
  const candidates = items.filter((item) => {
    if (type && item.type !== type && !(type === "movie" && item.type === "movie")) {
      return false;
    }
    return normalizeTitle(item.title) === needle;
  });

  if (candidates.length === 0) return null;
  if (year) {
    const withYear = candidates.find((item) => releaseYear(item.releaseDate) === year);
    if (withYear) return withYear;
  }

  return candidates[0];
}

export function isEpisodePlaybackMatch(
  item: MediaItem,
  query: { type: "movie" | "series"; season?: number; episode?: number }
): boolean {
  if (query.type !== "series" || query.season == null || query.episode == null) {
    return true;
  }
  return (
    item.type === "episode" &&
    item.season === query.season &&
    item.episode === query.episode
  );
}
