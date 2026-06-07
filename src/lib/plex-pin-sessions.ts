import fs from "fs";
import path from "path";
import { getDataPath } from "./data-path";

export interface PlexPinSession {
  pinId: string;
  clientId: string;
  code: string;
  authToken?: string;
  createdAt: string;
}

function sessionsFile(): string {
  return path.join(getDataPath(), "plex-pin-sessions.json");
}

function readSessions(): Record<string, PlexPinSession> {
  try {
    return JSON.parse(fs.readFileSync(sessionsFile(), "utf8")) as Record<string, PlexPinSession>;
  } catch {
    return {};
  }
}

function writeSessions(sessions: Record<string, PlexPinSession>): void {
  const file = sessionsFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(sessions, null, 2), "utf8");
}

function pruneSessions(sessions: Record<string, PlexPinSession>): Record<string, PlexPinSession> {
  const cutoff = Date.now() - 30 * 60 * 1000;
  const next: Record<string, PlexPinSession> = {};
  for (const [key, session] of Object.entries(sessions)) {
    if (new Date(session.createdAt).getTime() >= cutoff) {
      next[key] = session;
    }
  }
  return next;
}

export function savePlexPinSession(session: PlexPinSession): void {
  const sessions = pruneSessions(readSessions());
  sessions[session.pinId] = session;
  writeSessions(sessions);
}

export function getPlexPinSession(pinId: string): PlexPinSession | null {
  const sessions = pruneSessions(readSessions());
  return sessions[pinId] ?? null;
}

export function markPlexPinAuthorized(pinId: string, authToken: string): void {
  const sessions = pruneSessions(readSessions());
  const existing = sessions[pinId];
  if (!existing) return;
  sessions[pinId] = { ...existing, authToken };
  writeSessions(sessions);
}

export function deletePlexPinSession(pinId: string): void {
  const sessions = pruneSessions(readSessions());
  delete sessions[pinId];
  writeSessions(sessions);
}
