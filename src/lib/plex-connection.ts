import { getPlexToken, getPlexUrl } from "./env";
import type { ServerSettings } from "./server-settings";

export function isPlexUrlPinnedFromEnv(): boolean {
  return Boolean(getPlexUrl());
}

/** Plex URL/token the server should use (container env wins for URL). */
export function resolvePlexConnection(
  settings: Pick<ServerSettings, "plexUrl" | "plexToken">
): { plexUrl: string; plexToken: string } {
  const envUrl = getPlexUrl();
  const envToken = getPlexToken();
  const plexUrl = (envUrl || settings.plexUrl || "").replace(/\/$/, "");
  const plexToken = settings.plexToken || envToken || "";
  return { plexUrl, plexToken };
}

export function plexConfigured(
  settings: Pick<ServerSettings, "plexUrl" | "plexToken">
): boolean {
  const { plexUrl, plexToken } = resolvePlexConnection(settings);
  return Boolean(plexUrl && plexToken);
}

export function withResolvedPlex(settings: ServerSettings): ServerSettings {
  const { plexUrl, plexToken } = resolvePlexConnection(settings);
  return { ...settings, plexUrl, plexToken };
}
