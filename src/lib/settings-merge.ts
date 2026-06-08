import type { NextRequest, NextResponse } from "next/server";
import type { ServerSettings } from "./server-settings";

export function applySettingsCookies(
  response: NextResponse,
  settings: ServerSettings
): void {
  const opts = {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax" as const,
    httpOnly: true,
  };

  if (settings.plexUrl) response.cookies.set("plex_url", settings.plexUrl, opts);
  if (settings.plexToken) response.cookies.set("plex_token", settings.plexToken, opts);
  if (settings.libraryPath) response.cookies.set("library_path", settings.libraryPath, opts);
  if (settings.tmdbApiKey) response.cookies.set("tmdb_key", settings.tmdbApiKey, opts);
  if (settings.tvdbApiKey) response.cookies.set("tvdb_key", settings.tvdbApiKey, opts);
  if (settings.realDebridToken) {
    response.cookies.set("debrid_token", settings.realDebridToken, opts);
  }
}

export function settingsFromCookies(cookieHeader: string | null): Partial<ServerSettings> {
  if (!cookieHeader) return {};
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k, decodeURIComponent(v.join("="))];
    })
  );
  return {
    plexUrl: cookies.plex_url || "",
    plexToken: cookies.plex_token || "",
    libraryPath: cookies.library_path || "",
    tmdbApiKey: cookies.tmdb_key || "",
    tvdbApiKey: cookies.tvdb_key || "",
    realDebridToken: cookies.debrid_token || "",
  };
}

export function settingsFromHeaders(request: NextRequest): Partial<ServerSettings> {
  const h = request.headers;
  return {
    realDebridToken: h.get("x-debrid-token") || "",
    tmdbApiKey: h.get("x-tmdb-key") || "",
    tvdbApiKey: h.get("x-tvdb-key") || "",
    libraryPath: h.get("x-library-path") || "",
    plexUrl: h.get("x-plex-url") || "",
    plexToken: h.get("x-plex-token") || "",
  };
}

function coalesce(...values: (string | undefined)[]): string {
  for (const v of values) {
    if (v?.trim()) return v.trim();
  }
  return "";
}

export function mergeAllSettings(
  base: ServerSettings,
  ...layers: Partial<ServerSettings>[]
): ServerSettings {
  let merged = { ...base };
  for (const layer of layers) {
    merged = {
      realDebridToken: coalesce(layer.realDebridToken, merged.realDebridToken),
      tmdbApiKey: coalesce(layer.tmdbApiKey, merged.tmdbApiKey),
      tvdbApiKey: coalesce(layer.tvdbApiKey, merged.tvdbApiKey),
      libraryPath: coalesce(layer.libraryPath, merged.libraryPath),
      plexUrl: coalesce(layer.plexUrl, merged.plexUrl),
      plexToken: coalesce(layer.plexToken, merged.plexToken),
      torrentioUrl: coalesce(layer.torrentioUrl, merged.torrentioUrl),
      peerflixUrl: coalesce(layer.peerflixUrl, merged.peerflixUrl),
      directPlay: layer.directPlay ?? merged.directPlay,
      plexOnly: layer.plexOnly ?? merged.plexOnly,
    };
  }
  return merged;
}
