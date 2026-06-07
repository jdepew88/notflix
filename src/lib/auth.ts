import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "crypto";
import { cookies } from "next/headers";
import { getDataPath } from "./data-path";
import {
  SESSION_COOKIE,
  createSessionToken,
  parseSessionToken,
  sessionCookieOptions,
} from "./session";

export { SESSION_COOKIE, createSessionToken, parseSessionToken, sessionCookieOptions };

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const test = scryptSync(password, salt, 64).toString("hex");
  try {
    return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(test, "hex"));
  } catch {
    return false;
  }
}

export async function getSessionUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return (await parseSessionToken(token))?.userId ?? null;
}

export function usersFilePath(): string {
  return `${getDataPath()}/users.json`;
}
