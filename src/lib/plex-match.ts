import type { MediaItem } from "./types";

function normalizeTitle(title: string): string {
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

export function findInPlexLibrary(
  items: MediaItem[],
  query: {
    tmdbId?: number;
    title?: string;
    year?: number;
    type?: "movie" | "series" | "episode";
  }
): MediaItem | null {
  const { tmdbId, title, year, type } = query;

  if (tmdbId) {
    const byTmdb = items.find(
      (item) =>
        item.tmdbId === tmdbId &&
        (!type || item.type === type || (type === "movie" && item.type === "movie"))
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
