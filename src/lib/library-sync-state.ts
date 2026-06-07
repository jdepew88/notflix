import fs from "fs";
import path from "path";
import { getDataPath } from "./data-path";

export type LibrarySyncPhase =
  | "idle"
  | "starting"
  | "plex-sections"
  | "fetching"
  | "enriching"
  | "building-rows"
  | "saving"
  | "done"
  | "error";

export interface LibrarySyncState {
  status: "idle" | "running" | "done" | "error";
  phase: LibrarySyncPhase;
  message: string;
  current: number;
  total: number;
  itemsLoaded: number;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

const IDLE: LibrarySyncState = {
  status: "idle",
  phase: "idle",
  message: "",
  current: 0,
  total: 0,
  itemsLoaded: 0,
};

function syncStatePath(): string {
  return path.join(getDataPath(), "library-sync.json");
}

export function readLibrarySyncState(): LibrarySyncState {
  try {
    const raw = fs.readFileSync(syncStatePath(), "utf8");
    return JSON.parse(raw) as LibrarySyncState;
  } catch {
    return { ...IDLE };
  }
}

export function writeLibrarySyncState(state: LibrarySyncState): void {
  const file = syncStatePath();
  const tmp = `${file}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

export function resetLibrarySyncState(): void {
  writeLibrarySyncState({ ...IDLE });
}

export function updateLibrarySyncState(
  patch: Partial<LibrarySyncState>
): LibrarySyncState {
  const next = { ...readLibrarySyncState(), ...patch };
  writeLibrarySyncState(next);
  return next;
}

export function syncProgressPercent(state: LibrarySyncState): number {
  if (state.status === "done") return 100;
  if (state.total <= 0) {
    if (state.status === "running") return 5;
    return 0;
  }
  return Math.min(99, Math.round((state.current / state.total) * 100));
}
