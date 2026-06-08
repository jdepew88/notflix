import fs from "fs";
import path from "path";
import {
  getLibraryPath,
  getPeerflixUrl,
  getPlexToken,
  getPlexUrl,
  getRealDebridToken,
  getTmdbApiKey,
  getTorrentioUrl,
  getTvdbApiKey,
} from "./env";

export interface ServerSettings {
  realDebridToken: string;
  tmdbApiKey: string;
  tvdbApiKey: string;
  libraryPath: string;
  plexUrl: string;
  plexToken: string;
  torrentioUrl: string;
  peerflixUrl: string;
  directPlay: boolean;
  plexOnly: boolean;
}

function settingsFilePath(): string {
  const dataPath =
    process.env.DATA_PATH?.trim() ||
    path.join(/* turbopackIgnore: true */ process.cwd(), ".data");
  return path.join(dataPath, "settings.json");
}

export function settingsFromEnv(): ServerSettings {
  return {
    realDebridToken: getRealDebridToken(),
    tmdbApiKey: getTmdbApiKey(),
    tvdbApiKey: getTvdbApiKey(),
    libraryPath: getLibraryPath(),
    plexUrl: getPlexUrl(),
    plexToken: getPlexToken(),
    torrentioUrl: getTorrentioUrl(),
    peerflixUrl: getPeerflixUrl(),
    directPlay: process.env.DIRECT_PLAY !== "false",
    plexOnly: process.env.PLEX_ONLY !== "false",
  };
}

function readPersistedFile(): Partial<ServerSettings> {
  try {
    const raw = fs.readFileSync(settingsFilePath(), "utf8");
    return JSON.parse(raw) as Partial<ServerSettings>;
  } catch {
    return {};
  }
}

function mergeLayer(
  base: ServerSettings,
  overlay: Partial<ServerSettings>
): ServerSettings {
  return {
    realDebridToken: overlay.realDebridToken || base.realDebridToken,
    tmdbApiKey: overlay.tmdbApiKey || base.tmdbApiKey,
    tvdbApiKey: overlay.tvdbApiKey || base.tvdbApiKey,
    libraryPath: overlay.libraryPath || base.libraryPath,
    plexUrl: overlay.plexUrl || base.plexUrl,
    plexToken: overlay.plexToken || base.plexToken,
    torrentioUrl: overlay.torrentioUrl || base.torrentioUrl,
    peerflixUrl: overlay.peerflixUrl || base.peerflixUrl,
    directPlay: overlay.directPlay ?? base.directPlay,
    plexOnly: overlay.plexOnly ?? base.plexOnly,
  };
}

let cached: ServerSettings | null = null;

export function invalidateSettingsCache(): void {
  cached = null;
}

/** Docker/.env values for URL paths always win over settings.json (sign-in may store relay URLs). */
function pinEnvInfrastructure(
  settings: ServerSettings,
  env: ServerSettings
): ServerSettings {
  return {
    ...settings,
    plexUrl: env.plexUrl || settings.plexUrl,
    libraryPath: env.libraryPath || settings.libraryPath,
    plexToken: settings.plexToken || env.plexToken,
  };
}

/** Env seeds empty fields; persisted file overrides env for secrets; infra URLs pinned from env. */
export function getServerSettingsSync(): ServerSettings {
  if (cached) return cached;

  const fromEnv = settingsFromEnv();
  const fromFile = readPersistedFile();
  cached = pinEnvInfrastructure(mergeLayer(fromEnv, fromFile), fromEnv);
  return cached;
}

export function saveServerSettings(settings: ServerSettings): void {
  const filePath = settingsFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), "utf8");
  cached = settings;
}

/** On boot: write merged env+file to disk so settings survive container recreation. */
export function seedSettingsFromEnv(): void {
  const fromEnv = settingsFromEnv();
  const fromFile = readPersistedFile();
  const merged = mergeLayer(fromEnv, fromFile);

  const filePath = settingsFilePath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(filePath)) {
    saveServerSettings(merged);
    console.log("[notflix] Created settings file from environment");
    return;
  }

  const updated = mergeLayer(fromEnv, { ...fromFile, ...pickEnvOverrides(fromEnv, fromFile) });
  saveServerSettings(updated);
}

const ENV_PINNED_KEYS: Array<keyof ServerSettings> = ["plexUrl", "libraryPath"];

/** Env values replace empty persisted fields; infra URLs always follow env when set. */
function pickEnvOverrides(
  env: ServerSettings,
  file: Partial<ServerSettings>
): Partial<ServerSettings> {
  const out: Partial<ServerSettings> = {};
  (Object.keys(env) as Array<keyof ServerSettings>).forEach((key) => {
    if (key === "directPlay") return;
    const envVal = env[key];
    const fileVal = file[key];
    if (typeof envVal === "string" && envVal) {
      if (ENV_PINNED_KEYS.includes(key) || !fileVal) {
        (out as Record<string, string>)[key] = envVal;
      }
    }
  });
  return out;
}

export function toClientSettings(settings: ServerSettings) {
  return {
    realDebridToken: settings.realDebridToken,
    tmdbApiKey: settings.tmdbApiKey,
    tvdbApiKey: settings.tvdbApiKey,
    libraryPath: settings.libraryPath,
    plexUrl: settings.plexUrl,
    plexToken: settings.plexToken,
    directPlay: settings.directPlay,
    plexOnly: settings.plexOnly,
  };
}
