/** Server-side environment helpers with production defaults. */

import { resolveLibraryPath } from "./library-path";
import { finalizeStremioAddonUrl } from "./stremio-streams";

export function getPort(): number {
  const raw = process.env.PORT?.trim();
  const parsed = raw ? parseInt(raw, 10) : 3000;
  return Number.isFinite(parsed) ? parsed : 3000;
}

export function getLibraryPath(): string {
  return resolveLibraryPath(process.env.LIBRARY_PATH);
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
  const raw = process.env.TORRENTIO_URL?.trim() || "";
  return raw ? finalizeStremioAddonUrl(raw) : "";
}

export function getPeerflixUrl(): string {
  const raw = process.env.PEERFLIX_URL?.trim() || "";
  return raw ? finalizeStremioAddonUrl(raw) : "";
}

export function logStartupConfig(): void {
  const port = getPort();
  const plexUrl = getPlexUrl() || "(not set)";
  const libraryPath = getLibraryPath() || "(not set)";
  const tokenStatus = getPlexToken() ? "[configured]" : "(not set)";
  const debridStatus = getRealDebridToken() ? "[configured]" : "(not set)";
  const torrentioStatus = getTorrentioUrl() ? "[configured]" : "(not set)";
  const peerflixStatus = getPeerflixUrl() ? "[configured]" : "(default addon)";
  const directPlay = process.env.DIRECT_PLAY !== "false";
  const heroVideo = process.env.HERO_VIDEO?.trim().toLowerCase();
  const heroEnabled = !(
    heroVideo === "0" ||
    heroVideo === "false" ||
    heroVideo === "off" ||
    heroVideo === "no"
  );

  console.log("[notflix] Server configuration");
  console.log(`[notflix]   PORT=${port}`);
  console.log(`[notflix]   PLEX_URL=${plexUrl}`);
  console.log(`[notflix]   LIBRARY_PATH=${libraryPath}`);
  console.log(`[notflix]   PLEX_TOKEN=${tokenStatus}`);
  console.log(`[notflix]   REAL_DEBRID_TOKEN=${debridStatus}`);
  console.log(`[notflix]   TORRENTIO_URL=${torrentioStatus}`);
  console.log(`[notflix]   PEERFLIX_URL=${peerflixStatus}`);
  console.log(`[notflix]   DIRECT_PLAY=${directPlay}`);
  console.log(`[notflix]   HERO_VIDEO=${heroEnabled}`);
  console.log("[notflix]   ffmpeg=software libx264 (no GPU hwaccel)");
}
