/** Server-side environment helpers with production defaults. */

export function getPort(): number {
  const raw = process.env.PORT?.trim();
  const parsed = raw ? parseInt(raw, 10) : 3000;
  return Number.isFinite(parsed) ? parsed : 3000;
}

export function getLibraryPath(): string {
  const fromEnv = process.env.LIBRARY_PATH?.trim();
  if (fromEnv) return fromEnv;
  return process.env.NODE_ENV === "production" ? "/media" : "";
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

export function logStartupConfig(): void {
  const port = getPort();
  const plexUrl = getPlexUrl() || "(not set)";
  const libraryPath = getLibraryPath() || "(not set)";
  const tokenStatus = getPlexToken() ? "[configured]" : "(not set)";

  console.log("[notflix] Server configuration");
  console.log(`[notflix]   PORT=${port}`);
  console.log(`[notflix]   PLEX_URL=${plexUrl}`);
  console.log(`[notflix]   LIBRARY_PATH=${libraryPath}`);
  console.log(`[notflix]   PLEX_TOKEN=${tokenStatus}`);
}
