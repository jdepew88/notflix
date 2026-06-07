import crypto from "crypto";
import fs from "fs";
import path from "path";

const PLEX_TV = "https://plex.tv/api/v2";

export interface PlexPinResult {
  id: number;
  code: string;
  authToken?: string | null;
}

export interface PlexConnection {
  uri: string;
  local?: boolean;
  relay?: boolean;
  protocol?: string;
}

export interface PlexResource {
  name: string;
  product?: string;
  provides?: string;
  clientIdentifier?: string;
  owned?: boolean;
  connections?: PlexConnection[];
}

function dataPath(): string {
  return process.env.DATA_PATH?.trim() || path.join(process.cwd(), ".data");
}

export function getPlexClientIdentifier(): string {
  const fromEnv = process.env.PLEX_CLIENT_IDENTIFIER?.trim();
  if (fromEnv) return fromEnv;

  const file = path.join(dataPath(), "plex-client-id");
  try {
    const existing = fs.readFileSync(file, "utf8").trim();
    if (existing) return existing;
  } catch {
    /* generate below */
  }

  const id = crypto.randomUUID();
  fs.mkdirSync(dataPath(), { recursive: true });
  fs.writeFileSync(file, id, "utf8");
  return id;
}

function plexTvHeaders(clientId: string, token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Plex-Product": "Notflix",
    "X-Plex-Version": "1.0",
    "X-Plex-Client-Identifier": clientId,
    "X-Plex-Platform": "Web",
  };
  if (token) headers["X-Plex-Token"] = token;
  return headers;
}

export function buildPlexAuthUrl(clientId: string, code: string): string {
  const params = new URLSearchParams({
    clientID: clientId,
    code,
    "context[device][product]": "Notflix",
    "context[device][platform]": "Web",
  });
  return `https://app.plex.tv/auth/#?${params.toString()}`;
}

export async function createPlexPin(clientId: string): Promise<PlexPinResult> {
  const res = await fetch(`${PLEX_TV}/pins?strong=true`, {
    method: "POST",
    headers: plexTvHeaders(clientId),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Plex sign-in failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as PlexPinResult;
  if (!data.id || !data.code) {
    throw new Error("Plex sign-in returned an invalid PIN");
  }
  return data;
}

export async function checkPlexPin(pinId: string, clientId: string): Promise<PlexPinResult> {
  const res = await fetch(`${PLEX_TV}/pins/${encodeURIComponent(pinId)}`, {
    headers: plexTvHeaders(clientId),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Plex PIN check failed (${res.status}): ${text.slice(0, 200)}`);
  }

  return (await res.json()) as PlexPinResult;
}

export async function fetchPlexResources(token: string): Promise<PlexResource[]> {
  const clientId = getPlexClientIdentifier();
  const res = await fetch(`${PLEX_TV}/resources?includeHttps=1&includeRelay=1`, {
    headers: plexTvHeaders(clientId, token),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Plex resources failed (${res.status})`);
  }

  const data = (await res.json()) as PlexResource[] | { MediaContainer?: { Device?: PlexResource[] } };
  if (Array.isArray(data)) return data;
  return data.MediaContainer?.Device ?? [];
}

export function isPlexServer(resource: PlexResource): boolean {
  return resource.provides?.split(",").map((p) => p.trim()).includes("server") ?? false;
}

export function selectPlexServerUrl(
  resources: PlexResource[],
  existingUrl?: string
): { url: string | null; serverName?: string } {
  const servers = resources.filter(isPlexServer);
  if (servers.length === 0) return { url: null };

  const normalize = (uri: string) => uri.replace(/\/$/, "");

  if (existingUrl) {
    const wanted = normalize(existingUrl);
    for (const server of servers) {
      for (const connection of server.connections ?? []) {
        if (normalize(connection.uri) === wanted) {
          return { url: wanted, serverName: server.name };
        }
      }
    }
  }

  const ranked = [...servers].sort((a, b) => Number(b.owned) - Number(a.owned));

  for (const server of ranked) {
    const connections = server.connections ?? [];
    const localHttp = connections.find((c) => c.local && !c.relay && c.uri.startsWith("http://"));
    if (localHttp) return { url: normalize(localHttp.uri), serverName: server.name };

    const localHttps = connections.find((c) => c.local && !c.relay && c.uri.startsWith("https://"));
    if (localHttps) return { url: normalize(localHttps.uri), serverName: server.name };
  }

  for (const server of ranked) {
    const connection = server.connections?.[0];
    if (connection?.uri) {
      return { url: normalize(connection.uri), serverName: server.name };
    }
  }

  return { url: null };
}
