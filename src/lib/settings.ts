import type { NextRequest } from "next/server";
import {
  getLibraryPath,
  getPlexToken,
  getPlexUrl,
  getRealDebridToken,
  getTmdbApiKey,
  getTvdbApiKey,
} from "./env";

export interface ResolvedSettings {
  realDebridToken: string;
  tmdbApiKey: string;
  tvdbApiKey: string;
  libraryPath: string;
  plexUrl: string;
  plexToken: string;
}

export function resolveSettings(request?: NextRequest): ResolvedSettings {
  const h = request?.headers;

  return {
    realDebridToken:
      h?.get("x-debrid-token") || getRealDebridToken(),
    tmdbApiKey: h?.get("x-tmdb-key") || getTmdbApiKey(),
    tvdbApiKey: h?.get("x-tvdb-key") || getTvdbApiKey(),
    libraryPath: h?.get("x-library-path") || getLibraryPath(),
    plexUrl: h?.get("x-plex-url") || getPlexUrl(),
    plexToken: h?.get("x-plex-token") || getPlexToken(),
  };
}

export function settingsFromCookies(cookieHeader: string | null): Partial<ResolvedSettings> {
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
  };
}

export function mergeSettings(
  request: NextRequest
): ResolvedSettings {
  const fromHeaders = resolveSettings(request);
  const fromCookies = settingsFromCookies(request.headers.get("cookie"));
  return {
    realDebridToken: fromHeaders.realDebridToken,
    tmdbApiKey: fromHeaders.tmdbApiKey || fromCookies.tmdbApiKey || "",
    tvdbApiKey: fromHeaders.tvdbApiKey || fromCookies.tvdbApiKey || "",
    libraryPath: fromHeaders.libraryPath || fromCookies.libraryPath || "",
    plexUrl: fromHeaders.plexUrl || fromCookies.plexUrl || "",
    plexToken: fromHeaders.plexToken || fromCookies.plexToken || "",
  };
}
