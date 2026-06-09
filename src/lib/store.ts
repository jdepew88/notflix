"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { MediaItem, UserProfile } from "./types";
import {
  episodeProgressKey,
  getResumePlayback,
  type LastWatchedEntry,
} from "./watch-progress";
import { isSeriesItem, watchIdForItem } from "./watch-url";

interface AuthUser {
  id: string;
  name: string;
}

export interface QueueEntry {
  id: string;
  addedAt: number;
}

type UserStatePayload = {
  profiles: UserProfile[];
  activeProfileId: string | null;
  myListByProfile: Record<string, string[]>;
  queueByProfile?: Record<string, QueueEntry[]>;
  continueWatchingByProfile: Record<string, Record<string, number>>;
  lastWatchedByProfile?: Record<string, Record<string, LastWatchedEntry>>;
};

export interface ProgressUpdateMeta {
  season?: number;
  episode?: number;
  seriesId?: string;
}

interface AppState {
  user: AuthUser | null;
  userStateReady: boolean;
  profiles: UserProfile[];
  activeProfileId: string | null;
  myListByProfile: Record<string, string[]>;
  queueByProfile: Record<string, QueueEntry[]>;
  continueWatchingByProfile: Record<string, Record<string, number>>;
  lastWatchedByProfile: Record<string, Record<string, LastWatchedEntry>>;
  settings: {
    realDebridToken: string;
    tmdbApiKey: string;
    tvdbApiKey: string;
    libraryPath: string;
    plexUrl: string;
    plexToken: string;
    directPlay: boolean;
    plexOnly: boolean;
  };
  setUser: (user: AuthUser | null) => void;
  hydrateUserState: (state: UserStatePayload) => void;
  setActiveProfile: (id: string) => void;
  addToMyList: (id: string) => void;
  removeFromMyList: (id: string) => void;
  addToQueue: (id: string) => void;
  removeFromQueue: (id: string) => void;
  updateProgress: (id: string, progress: number, meta?: ProgressUpdateMeta) => void;
  updateSettings: (settings: Partial<AppState["settings"]>) => void;
  logoutLocal: () => void;
}

const pendingProgressPatches: Array<{
  profileId: string;
  continueWatchingByProfile: Record<string, Record<string, number>>;
  lastWatchedByProfile: Record<string, Record<string, LastWatchedEntry>>;
}> = [];

async function persistUserStatePatch(patch: Partial<UserStatePayload>): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  try {
    const res = await fetch("/api/user/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      console.warn("[notflix] Failed to save watch progress to server");
    }
  } catch {
    console.warn("[notflix] Could not reach server to save watch progress");
  }
}

function profileKey(state: AppState): string | null {
  return state.activeProfileId;
}

function flushPendingProgress(state: AppState): void {
  if (!state.user || !state.userStateReady) return;
  const pk = state.activeProfileId;
  if (!pk) return;

  const pending = pendingProgressPatches.filter((p) => p.profileId === pk);
  if (pending.length === 0) return;

  const mergedContinue = { ...state.continueWatchingByProfile };
  const mergedLast = { ...state.lastWatchedByProfile };

  for (const patch of pending) {
    mergedContinue[pk] = { ...(mergedContinue[pk] ?? {}), ...(patch.continueWatchingByProfile[pk] ?? {}) };
    mergedLast[pk] = { ...(mergedLast[pk] ?? {}), ...(patch.lastWatchedByProfile[pk] ?? {}) };
  }

  pendingProgressPatches.splice(0, pendingProgressPatches.length);
  void persistUserStatePatch({
    continueWatchingByProfile: mergedContinue,
    lastWatchedByProfile: mergedLast,
  });
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      user: null,
      userStateReady: false,
      profiles: [],
      activeProfileId: null,
      myListByProfile: {},
      queueByProfile: {},
      continueWatchingByProfile: {},
      lastWatchedByProfile: {},
      settings: {
        realDebridToken: "",
        tmdbApiKey: "",
        tvdbApiKey: "",
        libraryPath: "",
        plexUrl: "",
        plexToken: "",
        directPlay: true,
        plexOnly: false,
      },
      setUser: (user) => set({ user }),
      hydrateUserState: (payload) => {
        set({
          userStateReady: true,
          profiles: payload.profiles,
          activeProfileId: payload.activeProfileId,
          myListByProfile: payload.myListByProfile,
          queueByProfile: payload.queueByProfile ?? {},
          continueWatchingByProfile: payload.continueWatchingByProfile,
          lastWatchedByProfile: payload.lastWatchedByProfile ?? {},
        });
        flushPendingProgress(get());
      },
      setActiveProfile: (id) => {
        set({ activeProfileId: id });
        if (!get().userStateReady || !get().user) return;
        void persistUserStatePatch({ activeProfileId: id });
      },
      addToMyList: (id) => {
        const pk = profileKey(get());
        if (!pk || !get().userStateReady) return;
        const lists = get().myListByProfile;
        const current = lists[pk] ?? [];
        if (current.includes(id)) return;
        const myListByProfile = { ...lists, [pk]: [...current, id] };
        set({ myListByProfile });
        void persistUserStatePatch({ myListByProfile });
      },
      removeFromMyList: (id) => {
        const pk = profileKey(get());
        if (!pk || !get().userStateReady) return;
        const lists = get().myListByProfile;
        const myListByProfile = {
          ...lists,
          [pk]: (lists[pk] ?? []).filter((x) => x !== id),
        };
        set({ myListByProfile });
        void persistUserStatePatch({ myListByProfile });
      },
      addToQueue: (id) => {
        const pk = profileKey(get());
        if (!pk || !get().userStateReady) return;
        const queues = get().queueByProfile;
        const current = queues[pk] ?? [];
        if (current.some((entry) => entry.id === id)) return;
        const queueByProfile = {
          ...queues,
          [pk]: [...current, { id, addedAt: Date.now() }],
        };
        set({ queueByProfile });
        void persistUserStatePatch({ queueByProfile });
      },
      removeFromQueue: (id) => {
        const pk = profileKey(get());
        if (!pk || !get().userStateReady) return;
        const queues = get().queueByProfile;
        const queueByProfile = {
          ...queues,
          [pk]: (queues[pk] ?? []).filter((entry) => entry.id !== id),
        };
        set({ queueByProfile });
        void persistUserStatePatch({ queueByProfile });
      },
      updateProgress: (id, progress, meta) => {
        const pk = profileKey(get());
        if (!pk) return;

        const all = get().continueWatchingByProfile;
        const lastAll = get().lastWatchedByProfile;
        const profileProgress = { ...(all[pk] ?? {}) };
        const profileLast = { ...(lastAll[pk] ?? {}) };

        const seriesId = meta?.seriesId ?? id;
        const progressKey =
          meta?.season != null && meta?.episode != null
            ? episodeProgressKey(seriesId, meta.season, meta.episode)
            : id;

        if (progress >= 95) {
          delete profileProgress[progressKey];
          if (meta?.season != null) {
            const existing = profileLast[seriesId];
            if (
              existing?.season === meta.season &&
              existing?.episode === meta.episode
            ) {
              delete profileLast[seriesId];
            }
          } else {
            delete profileLast[id];
          }
        } else if (progress > 0) {
          profileProgress[progressKey] = progress;
          profileProgress[seriesId] = progress;

          const entry: LastWatchedEntry = {
            progress,
            updatedAt: Date.now(),
            season: meta?.season,
            episode: meta?.episode,
          };
          profileLast[seriesId] = entry;
          if (meta?.season == null) {
            profileLast[id] = entry;
          }
        }

        const continueWatchingByProfile = { ...all, [pk]: profileProgress };
        const lastWatchedByProfile = { ...lastAll, [pk]: profileLast };

        set({ continueWatchingByProfile, lastWatchedByProfile });

        if (!get().userStateReady || !get().user) {
          pendingProgressPatches.push({
            profileId: pk,
            continueWatchingByProfile: { [pk]: profileProgress },
            lastWatchedByProfile: { [pk]: profileLast },
          });
          return;
        }

        void persistUserStatePatch({ continueWatchingByProfile, lastWatchedByProfile });
      },
      updateSettings: (settings) => {
        set({ settings: { ...get().settings, ...settings } });
      },
      logoutLocal: () =>
        set({
          user: null,
          userStateReady: false,
          profiles: [],
          activeProfileId: null,
          myListByProfile: {},
          queueByProfile: {},
          continueWatchingByProfile: {},
          lastWatchedByProfile: {},
        }),
    }),
    {
      name: "netflix-clone-storage",
      partialize: (state) => ({
        settings: state.settings,
        continueWatchingByProfile: state.continueWatchingByProfile,
        lastWatchedByProfile: state.lastWatchedByProfile,
        activeProfileId: state.activeProfileId,
      }),
    }
  )
);

export function getActiveMyList(): string[] {
  const s = useAppStore.getState();
  const pk = s.activeProfileId;
  if (!pk) return [];
  return s.myListByProfile[pk] ?? [];
}

export function isInMyList(id: string): boolean {
  return getActiveMyList().includes(id);
}

export function getActiveQueue(): QueueEntry[] {
  const s = useAppStore.getState();
  const pk = s.activeProfileId;
  if (!pk) return [];
  return s.queueByProfile[pk] ?? [];
}

export function isInQueue(id: string): boolean {
  return getActiveQueue().some((entry) => entry.id === id);
}

export function getMediaProgress(id: string): number {
  const s = useAppStore.getState();
  const pk = s.activeProfileId;
  if (!pk) return 0;
  return s.continueWatchingByProfile[pk]?.[id] ?? 0;
}

export function getLastWatched(mediaId: string): LastWatchedEntry | null {
  const s = useAppStore.getState();
  const pk = s.activeProfileId;
  if (!pk) return null;
  return s.lastWatchedByProfile[pk]?.[mediaId] ?? null;
}

export function getResumeForItem(item: MediaItem): ReturnType<typeof getResumePlayback> {
  const s = useAppStore.getState();
  const pk = s.activeProfileId;
  if (!pk) return null;
  const progressMap = s.continueWatchingByProfile[pk] ?? {};
  const lastWatched = s.lastWatchedByProfile[pk]?.[watchIdForItem(item)] ?? null;
  return getResumePlayback(item, progressMap, lastWatched);
}

export function getContinueWatchingItems(allItems: MediaItem[]): MediaItem[] {
  const s = useAppStore.getState();
  const pk = s.activeProfileId;
  if (!pk) return [];

  const progress = s.continueWatchingByProfile[pk] ?? {};
  const lastWatched = s.lastWatchedByProfile[pk] ?? {};
  const byId = new Map(allItems.map((i) => [i.id, i]));

  const entries = Object.entries(lastWatched)
    .map(([mediaId, entry]) => {
      const item = byId.get(mediaId);
      if (!item || entry.progress <= 0 || entry.progress >= 95) return null;

      if (isSeriesItem(item) && entry.season != null && entry.episode != null) {
        const epKey = episodeProgressKey(mediaId, entry.season, entry.episode);
        const epProgress = progress[epKey] ?? entry.progress;
        if (epProgress <= 0 || epProgress >= 95) return null;
        return {
          item: { ...item, progress: epProgress, season: entry.season, episode: entry.episode },
          updatedAt: entry.updatedAt,
        };
      }

      const p = progress[mediaId] ?? entry.progress;
      if (p <= 0 || p >= 95) return null;
      return { item: { ...item, progress: p }, updatedAt: entry.updatedAt };
    })
    .filter(Boolean) as Array<{ item: MediaItem; updatedAt: number }>;

  if (entries.length > 0) {
    return entries
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((e) => e.item);
  }

  return allItems
    .filter((i) => progress[i.id] && progress[i.id] > 0 && progress[i.id] < 95)
    .map((i) => ({ ...i, progress: progress[i.id] }));
}
