import crypto from "crypto";

interface SessionEntry {
  url: string;
  expiresAt: number;
}

const TTL_MS = 4 * 60 * 60 * 1000;
const sessions = new Map<string, SessionEntry>();

function cleanupExpired(): void {
  const now = Date.now();
  for (const [id, entry] of sessions) {
    if (entry.expiresAt <= now) sessions.delete(id);
  }
}

export function registerStreamUrl(url: string): string {
  cleanupExpired();
  const session = crypto
    .createHash("sha256")
    .update(`${url}:${Date.now()}:${Math.random()}`)
    .digest("hex")
    .slice(0, 20);
  sessions.set(session, { url, expiresAt: Date.now() + TTL_MS });
  return session;
}

export function resolveStreamSession(session: string): string | null {
  cleanupExpired();
  const entry = sessions.get(session);
  if (!entry) return null;
  return entry.url;
}

export function buildProxyStreamPath(session: string): string {
  return `/api/proxy/stream?session=${encodeURIComponent(session)}`;
}

/** Prefer session id when the upstream URL would make query strings too long. */
export function registerStreamUrlIfLong(url: string, maxQueryChars = 1800): {
  session: string;
  proxyPath: string;
} {
  const session = registerStreamUrl(url);
  return { session, proxyPath: buildProxyStreamPath(session) };
}
