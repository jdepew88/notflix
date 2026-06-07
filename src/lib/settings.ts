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
  return mergeAllSettings(current, body);
}

export { applySettingsCookies, saveServerSettings, getServerSettingsSync };
