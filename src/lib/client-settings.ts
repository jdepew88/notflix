import type { AppSettings } from "./types";

export function getEffectiveSettings(
  storeSettings?: Partial<AppSettings>
): AppSettings {
  return { ...getClientSettingsDefaults(), ...getClientSettings(), ...storeSettings };
}

export function buildSettingsHeaders(settings: Partial<AppSettings>): HeadersInit {
  const headers: Record<string, string> = {};
  if (settings.realDebridToken) headers["x-debrid-token"] = settings.realDebridToken;
  if (settings.tmdbApiKey) headers["x-tmdb-key"] = settings.tmdbApiKey;
  if (settings.tvdbApiKey) headers["x-tvdb-key"] = settings.tvdbApiKey;
  if (settings.libraryPath) headers["x-library-path"] = settings.libraryPath;
  if (settings.plexUrl) headers["x-plex-url"] = settings.plexUrl;
  if (settings.plexToken) headers["x-plex-token"] = settings.plexToken;
  return headers;
}

export function getClientSettings(): AppSettings {
  if (typeof window === "undefined") {
    return {
      realDebridToken: "",
      tmdbApiKey: "",
      tvdbApiKey: "",
      libraryPath: "",
      plexUrl: "",
      plexToken: "",
      directPlay: true,
    };
  }
  try {
    const raw = localStorage.getItem("netflix-clone-storage");
    if (!raw) return getClientSettingsDefaults();
    const parsed = JSON.parse(raw);
    return { ...getClientSettingsDefaults(), ...parsed.state?.settings };
  } catch {
    return getClientSettingsDefaults();
  }
}

function getClientSettingsDefaults(): AppSettings {
  return {
    realDebridToken: "",
    tmdbApiKey: "",
    tvdbApiKey: "",
    libraryPath: "",
    plexUrl: "",
    plexToken: "",
    directPlay: true,
  };
}

export async function syncSettingsToServer(settings: AppSettings): Promise<void> {
  await fetch("/api/settings/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
}

export async function fetchWithSettings(
  url: string,
  settings?: Partial<AppSettings>,
  init: RequestInit = {}
): Promise<Response> {
  const s = getEffectiveSettings(settings);
  return fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...buildSettingsHeaders(s),
      ...(init.headers as Record<string, string>),
    },
  });
}

export async function ensurePlexCookies(settings?: Partial<AppSettings>): Promise<void> {
  const s = getEffectiveSettings(settings);
  if (s.plexUrl && s.plexToken) {
    await syncSettingsToServer(s);
  }
}
