import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import type { MediaItem } from "./types";
import type { ServerSettings } from "./server-settings";
import { getDataPath } from "./data-path";
import { resolveLibraryPath } from "./library-path";

export function hashPlexToken(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 12);
}

export interface LibraryRowRecord {
  id: string;
  title: string;
  items: MediaItem[];
  featured?: boolean;
}

export interface LibraryDatabase {
  version: 2;
  cachedAt: string;
  source: string;
  plexUrl: string;
  plexTokenHash: string;
  libraryPath: string;
  items: MediaItem[];
  rows: LibraryRowRecord[];
  genres: string[];
  featuredHeroId: string | null;
  heroPrimaryId?: string | null;
  heroVideoError?: string | null;
}

const DB_VERSION = 2 as const;

function dbFilePath(): string {
  return path.join(getDataPath(), "library.db.json");
}

function legacyCachePath(): string {
  return path.join(getDataPath(), "library-cache.json");
}

function normalizePlexUrl(url: string): string {
  return url.replace(/\/$/, "");
}

function migrateLegacyCache(): LibraryDatabase | null {
  try {
    const raw = fs.readFileSync(legacyCachePath(), "utf8");
    const legacy = JSON.parse(raw) as Omit<LibraryDatabase, "version"> & { version?: number };
    if (!Array.isArray(legacy.items)) return null;
    const db: LibraryDatabase = { ...legacy, version: DB_VERSION };
    writeLibraryDatabase(db);
    return db;
  } catch {
    return null;
  }
}

export function readLibraryDatabase(): LibraryDatabase | null {
  try {
    const raw = fs.readFileSync(dbFilePath(), "utf8");
    const data = JSON.parse(raw) as LibraryDatabase;
    if (data.version !== DB_VERSION || !Array.isArray(data.items)) return null;
    return data;
  } catch {
    return migrateLegacyCache();
  }
}

export function writeLibraryDatabase(data: LibraryDatabase): void {
  const file = dbFilePath();
  const tmp = `${file}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, file);

  // Keep legacy path in sync for any older readers.
  const legacyFile = legacyCachePath();
  fs.writeFileSync(legacyFile, JSON.stringify({ ...data, version: 1 as const }, null, 2), "utf8");
}

export function deleteLibraryDatabase(): void {
  for (const file of [dbFilePath(), legacyCachePath()]) {
    try {
      fs.unlinkSync(file);
    } catch {
      /* ignore */
    }
  }
}

export function databaseMatchesSettings(
  db: LibraryDatabase,
  settings: ServerSettings
): boolean {
  if (settings.plexUrl && settings.plexToken) {
    return (
      db.source === "plex" &&
      db.plexUrl === normalizePlexUrl(settings.plexUrl) &&
      db.plexTokenHash === hashPlexToken(settings.plexToken)
    );
  }
  if (db.source !== "nfs") return false;
  return db.libraryPath === resolveLibraryPath(settings.libraryPath);
}

/** Same Plex server or NFS path — show cached titles even while token/sync catches up. */
export function databaseCompatibleWithSettings(
  db: LibraryDatabase,
  settings: ServerSettings
): boolean {
  if (settings.plexUrl?.trim()) {
    return db.source === "plex" && db.plexUrl === normalizePlexUrl(settings.plexUrl);
  }
  const libraryPath = resolveLibraryPath(settings.libraryPath);
  if (libraryPath) {
    return db.source === "nfs" && db.libraryPath === libraryPath;
  }
  return false;
}

export function updateLibraryDatabaseHero(
  featuredHeroId: string | null,
  heroPrimaryId: string | null,
  heroVideoError: string | null
): void {
  const db = readLibraryDatabase();
  if (!db) return;
  writeLibraryDatabase({
    ...db,
    featuredHeroId,
    heroPrimaryId,
    heroVideoError,
  });
}

export function databaseAsCache(db: LibraryDatabase) {
  return {
    version: 1 as const,
    cachedAt: db.cachedAt,
    source: db.source,
    plexUrl: db.plexUrl,
    plexTokenHash: db.plexTokenHash,
    libraryPath: db.libraryPath,
    items: db.items,
    rows: db.rows,
    genres: db.genres,
    featuredHeroId: db.featuredHeroId,
    heroPrimaryId: db.heroPrimaryId,
    heroVideoError: db.heroVideoError,
  };
}

export function cacheDataToDatabase(
  cache: Omit<LibraryDatabase, "version"> & { version?: number }
): LibraryDatabase {
  return { ...cache, version: DB_VERSION };
}
