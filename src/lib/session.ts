export const SESSION_COOKIE = "notflix_session";
export const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

const enc = new TextEncoder();

function sessionSecret(): string {
  return (
    process.env.SESSION_SECRET?.trim() ||
    process.env.PLEX_TOKEN?.trim() ||
    "notflix-dev-secret-change-in-production"
  );
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return toHex(sig);
}

export async function createSessionToken(userId: string): Promise<string> {
  const exp = Date.now() + SESSION_MS;
  const payload = `${userId}.${exp}`;
  const sig = await hmacHex(payload);
  return `${payload}.${sig}`;
}

export async function parseSessionToken(
  token: string
): Promise<{ userId: string } | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expStr, sig] = parts;
  const exp = parseInt(expStr, 10);
  if (!userId || !Number.isFinite(exp) || exp < Date.now()) return null;
  const payload = `${userId}.${expStr}`;
  const expected = await hmacHex(payload);
  if (!safeEqual(sig, expected)) return null;
  return { userId };
}

export function sessionCookieOptions(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MS / 1000,
  };
}
