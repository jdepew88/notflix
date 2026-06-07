/** Server-side environment helpers with production defaults. */

import { mapHostPathToContainer } from "./library-path";

export function getPort(): number {
  const raw = process.env.PORT?.trim();
  const parsed = raw ? parseInt(raw, 10) : 3000;
  return Number.isFinite(parsed) ? parsed : 3000;
}

export function getLibraryPath(): string {
  const fromEnv = process.env.LIBRARY_PATH?.trim();
  if (fromEnv) return mapHostPathToContainer(fromEnv);
  return process.env.NODE_ENV === "production" ? "/media/Video" : "";
}

export function getPlexUrl(): string {
  return process.env.PLEX_URL?.trim() || "";
}

export function getPlexToken(): string {
  return process.env.PLEX_TOKEN?.trim() || "";
}

export function getRealDebridToken(): string {
  return process.env.REAL_DEBRID_TOKEN?.trim() || "";
}

export function getTmdbApiKey(): string {
  return process.env.TMDB_API_KEY?.trim() || "";
}

export function getTvdbApiKey(): string {
  return process.env.TVDB_API_KEY?.trim() || "";
}

/** Full Torrentio install URL from configure page, without /manifest.json */
export function getTorrentioUrl(): string {
  return process.env.TORRENTIO_URL?.trim() || "";
}

export function logStartupConfig(): void {
  const port = getPort();
  const plexUrl = getPlexUrl() || "(not set)";
  const libraryPath = getLibraryPath() || "(not set)";
  const tokenStatus = getPlexToken() ? "[configured]" : "(not set)";
  const debridStatus = getRealDebridToken() ? "[configured]" : "(not set)";
  const torrentioStatus = getTorrentioUrl() ? "[configured]" : "(not set)";

  console.log("[notflix] Server configuration");
  console.log(`[notflix]   PORT=${port}`);
  console.log(`[notflix]   PLEX_URL=${plexUrl}`);
  console.log(`[notflix]   LIBRARY_PATH=${libraryPath}`);
  console.log(`[notflix]   PLEX_TOKEN=${tokenStatus}`);
  console.log(`[notflix]   REAL_DEBRID_TOKEN=${debridStatus}`);
  console.log(`[notflix]   TORRENTIO_URL=${torrentioStatus}`);
}
