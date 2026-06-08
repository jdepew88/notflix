import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { UserProfile } from "./types";
import { getDataPath } from "./data-path";
import { hashPassword, usersFilePath, verifyPassword } from "./auth";

export interface UserAccount {
  id: string;
  name: string;
  passwordHash: string;
  createdAt: string;
}

export interface LastWatchedEntry {
  season?: number;
  episode?: number;
  progress: number;
  updatedAt: number;
}

export interface UserState {
  profiles: UserProfile[];
  activeProfileId: string | null;
  myListByProfile: Record<string, string[]>;
  continueWatchingByProfile: Record<string, Record<string, number>>;
  lastWatchedByProfile?: Record<string, Record<string, LastWatchedEntry>>;
}

interface UsersFile {
  users: UserAccount[];
}

const DEFAULT_PROFILES: UserProfile[] = [
  { id: "1", name: "Main", avatar: "👤" },
  { id: "2", name: "Kids", avatar: "🧒", isKids: true },
];

function readUsersFile(): UsersFile {
  try {
    return JSON.parse(fs.readFileSync(usersFilePath(), "utf8")) as UsersFile;
  } catch {
    return { users: [] };
  }
}

function writeUsersFile(data: UsersFile): void {
  const file = usersFilePath();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : "write failed";
    throw new Error(
      `Could not save account data to ${file}. Check DATA_PATH permissions (${message}).`
    );
  }
}

function userStatePath(userId: string): string {
  return path.join(getDataPath(), "users", `${userId}.json`);
}

function defaultUserState(): UserState {
  return {
    profiles: DEFAULT_PROFILES.map((p) => ({ ...p, id: randomUUID() })),
    activeProfileId: null,
    myListByProfile: {},
    continueWatchingByProfile: {},
  };
}

export function readUserState(userId: string): UserState {
  try {
    const raw = fs.readFileSync(userStatePath(userId), "utf8");
    const parsed = JSON.parse(raw) as UserState;
    return {
      profiles: parsed.profiles?.length ? parsed.profiles : defaultUserState().profiles,
      activeProfileId: parsed.activeProfileId ?? null,
      myListByProfile: parsed.myListByProfile ?? {},
      continueWatchingByProfile: parsed.continueWatchingByProfile ?? {},
      lastWatchedByProfile: parsed.lastWatchedByProfile ?? {},
    };
  } catch {
    const state = defaultUserState();
    writeUserState(userId, state);
    return state;
  }
}

export function writeUserState(userId: string, state: UserState): void {
  const file = userStatePath(userId);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(state, null, 2), "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : "write failed";
    throw new Error(
      `Could not save profile data to ${file}. Check DATA_PATH permissions (${message}).`
    );
  }
}

export function createUser(name: string, password: string): UserAccount {
  const trimmed = name.trim();
  if (trimmed.length < 2) throw new Error("Name must be at least 2 characters");
  if (password.length < 4) throw new Error("Password must be at least 4 characters");

  const data = readUsersFile();
  if (data.users.some((u) => u.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error("An account with this name already exists");
  }

  const user: UserAccount = {
    id: randomUUID(),
    name: trimmed,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  data.users.push(user);
  writeUsersFile(data);
  writeUserState(user.id, defaultUserState());
  return user;
}

export function authenticateUser(name: string, password: string): UserAccount | null {
  const trimmed = name.trim();
  const data = readUsersFile();
  const user = data.users.find((u) => u.name.toLowerCase() === trimmed.toLowerCase());
  if (!user || !verifyPassword(password, user.passwordHash)) return null;
  return user;
}

export function getUserById(userId: string): UserAccount | null {
  return readUsersFile().users.find((u) => u.id === userId) ?? null;
}

export function addProfile(userId: string, name: string, avatar: string): UserProfile {
  const state = readUserState(userId);
  const profile: UserProfile = {
    id: randomUUID(),
    name: name.trim() || "Profile",
    avatar: avatar || "👤",
  };
  state.profiles.push(profile);
  writeUserState(userId, state);
  return profile;
}

export function removeProfile(userId: string, profileId: string): void {
  const state = readUserState(userId);
  if (state.profiles.length <= 1) throw new Error("You must keep at least one profile");
  state.profiles = state.profiles.filter((p) => p.id !== profileId);
  delete state.myListByProfile[profileId];
  delete state.continueWatchingByProfile[profileId];
  if (state.activeProfileId === profileId) state.activeProfileId = null;
  writeUserState(userId, state);
}
