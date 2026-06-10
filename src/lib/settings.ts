import type { NextRequest } from "next/server";
import {
  applySettingsCookies,
  mergeAllSettings,
  settingsFromCookies,
  settingsFromHeaders,
} from "./settings-merge";
import {
  getServerSettingsSync,
  saveServerSettings,
  type ServerSettings,
} from "./server-settings";
import { resolveLibraryPath } from "./library-path";
import { withResolvedPlex } from "./plex-connection";

export type { ServerSettings as ResolvedSettings };

export function mergeSettings(request: NextRequest): ServerSettings {
  const base = getServerSettingsSync();
  const fromHeaders = settingsFromHeaders(request);
  const fromCookies = settingsFromCookies(request.headers.get("cookie"));

  return mergeAllSettings(base, fromCookies, fromHeaders);
}

/** Server-side ops: env/file win over browser headers for paths and Plex URL. */
export function mergeSettingsForServerOps(request: NextRequest): ServerSettings {
  const base = getServerSettingsSync();
  const empty: ServerSettings = {
    realDebridToken: "",
    tmdbApiKey: "",
    tvdbApiKey: "",
    libraryPath: "",
    plexUrl: "",
    plexToken: "",
    torrentioUrl: "",
    peerflixUrl: "",
    directPlay: true,
    plexOnly: false,
  };
  const client = mergeAllSettings(
    empty,
    settingsFromCookies(request.headers.get("cookie")),
    settingsFromHeaders(request)
  );

  const merged: ServerSettings = {
    realDebridToken: base.realDebridToken || client.realDebridToken,
    tmdbApiKey: base.tmdbApiKey || client.tmdbApiKey,
    tvdbApiKey: base.tvdbApiKey || client.tvdbApiKey,
    libraryPath: base.libraryPath || client.libraryPath,
    plexUrl: base.plexUrl || client.plexUrl,
    plexToken: client.plexToken || base.plexToken,
    torrentioUrl: base.torrentioUrl || client.torrentioUrl,
    peerflixUrl: base.peerflixUrl || client.peerflixUrl,
    directPlay: client.directPlay ?? base.directPlay,
    plexOnly: client.plexOnly ?? base.plexOnly,
  };
  return withResolvedPlex(merged);
}

export function mergeSettingsFromBody(
  request: NextRequest,
  body: Partial<ServerSettings>
): ServerSettings {
  const current = mergeSettings(request);
  const normalized = {
    ...body,
    libraryPath: body.libraryPath
      ? resolveLibraryPath(body.libraryPath)
      : body.libraryPath,
  };
  return mergeAllSettings(current, normalized);
}

export { applySettingsCookies, saveServerSettings, getServerSettingsSync };
