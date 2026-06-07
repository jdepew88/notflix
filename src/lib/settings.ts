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
import { mapHostPathToContainer } from "./library-path";

export type { ServerSettings as ResolvedSettings };

export function mergeSettings(request: NextRequest): ServerSettings {
  const base = getServerSettingsSync();
  const fromHeaders = settingsFromHeaders(request);
  const fromCookies = settingsFromCookies(request.headers.get("cookie"));

  return mergeAllSettings(base, fromCookies, fromHeaders);
}

export function mergeSettingsFromBody(
  request: NextRequest,
  body: Partial<ServerSettings>
): ServerSettings {
  const current = mergeSettings(request);
  const normalized = {
    ...body,
    libraryPath: body.libraryPath
      ? mapHostPathToContainer(body.libraryPath)
      : body.libraryPath,
  };
  return mergeAllSettings(current, normalized);
}

export { applySettingsCookies, saveServerSettings, getServerSettingsSync };
