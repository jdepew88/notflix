import fs from "fs/promises";
import path from "path";
import type { MediaItem } from "./types";
import { slugifyMediaTitle } from "./media-slug";

const VIDEO_EXTENSIONS = new Set([
  ".mkv",
  ".mp4",
  ".avi",
  ".mov",
  ".wmv",
  ".m4v",
  ".webm",
  ".ts",
  ".m2ts",
]);

function isVideoFile(filename: string): boolean {
  return VIDEO_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

function slugify(text: string): string {
  return slugifyMediaTitle(text);
}

function parseMediaFilename(filename: string): {
  title: string;
  year?: string;
  season?: number;
  episode?: number;
} {
  const base = path.basename(filename, path.extname(filename));

  const episodeMatch = base.match(/^(.+?)[.\s_-]S(\d{1,2})E(\d{1,2})/i);
  if (episodeMatch) {
    return {
      title: episodeMatch[1].replace(/[._]/g, " ").trim(),
      season: parseInt(episodeMatch[2], 10),
      episode: parseInt(episodeMatch[3], 10),
    };
  }

  const yearMatch = base.match(/^(.+?)[.\s_(]+(\d{4})/);
  if (yearMatch) {
    return {
      title: yearMatch[1].replace(/[._]/g, " ").trim(),
      year: yearMatch[2],
    };
  }

  return { title: base.replace(/[._]/g, " ").trim() };
}

async function scanDirectory(
  dirPath: string,
  rootPath: string,
  items: MediaItem[]
): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.name.startsWith(".")) continue;

    if (entry.isDirectory()) {
      await scanDirectory(fullPath, rootPath, items);
    } else if (entry.isFile() && isVideoFile(entry.name)) {
      const relativePath = path.relative(rootPath, fullPath);
      const parsed = parseMediaFilename(entry.name);
      const id = `lib-${slugify(relativePath)}`;

      items.push({
        id,
        title: parsed.title,
        releaseDate: parsed.year,
        type: parsed.season ? "episode" : "movie",
        source: "library",
        filePath: fullPath,
        season: parsed.season,
        episode: parsed.episode,
        overview: relativePath,
      });
    }
  }
}

export async function scanLibrary(libraryPath: string): Promise<MediaItem[]> {
  const items: MediaItem[] = [];
  await scanDirectory(libraryPath, libraryPath, items);
  return items.sort((a, b) => a.title.localeCompare(b.title));
}

export function groupLibraryItems(items: MediaItem[]): {
  movies: MediaItem[];
  series: Map<string, MediaItem[]>;
} {
  const movies: MediaItem[] = [];
  const series = new Map<string, MediaItem[]>();

  for (const item of items) {
    if (item.type === "episode" && item.season !== undefined) {
      const key = slugify(item.title);
      const episodes = series.get(key) ?? [];
      episodes.push(item);
      series.set(key, episodes);
    } else {
      movies.push(item);
    }
  }

  return { movies, series };
}

export function buildContentRows(items: MediaItem[]): Array<{
  id: string;
  title: string;
  items: MediaItem[];
}> {
  const { movies, series } = groupLibraryItems(items);
  const rows: Array<{ id: string; title: string; items: MediaItem[] }> = [];

  if (movies.length > 0) {
    rows.push({ id: "movies", title: "Movies", items: movies.slice(0, 20) });
  }

  const seriesEntries = Array.from(series.entries());
  if (seriesEntries.length > 0) {
    const seriesItems: MediaItem[] = seriesEntries.map(([key, episodes]) => {
      const sorted = [...episodes].sort(
        (a, b) =>
          (a.season ?? 0) - (b.season ?? 0) || (a.episode ?? 0) - (b.episode ?? 0)
      );
      const first = sorted[0];
      return {
        id: `series-${key}`,
        title: first.title,
        type: "series" as const,
        source: "library" as const,
        overview: `${episodes.length} episodes`,
        seriesId: first.id,
      };
    });
    rows.push({ id: "series", title: "TV Shows", items: seriesItems });
  }

  const recentlyAdded = [...items].reverse().slice(0, 20);
  if (recentlyAdded.length > 0) {
    rows.push({ id: "recent", title: "Recently Added", items: recentlyAdded });
  }

  return rows;
}

export function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".mp4": "video/mp4",
    ".mkv": "video/x-matroska",
    ".avi": "video/x-msvideo",
    ".mov": "video/quicktime",
    ".wmv": "video/x-ms-wmv",
    ".m4v": "video/x-m4v",
    ".webm": "video/webm",
    ".ts": "video/mp2t",
  };
  return mimeMap[ext] ?? "application/octet-stream";
}
