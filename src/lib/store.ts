"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { MediaItem, UserProfile } from "./types";

interface AuthUser {
  id: string;
  name: string;
}

interface AppState {
  user: AuthUser | null;
  profiles: UserProfile[];
  activeProfileId: string | null;
  myListByProfile: Record<string, string[]>;
  continueWatchingByProfile: Record<string, Record<string, number>>;
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
  hydrateUserState: (state: {
    profiles: UserProfile[];
    activeProfileId: string | null;
    myListByProfile: Record<string, string[]>;
    continueWatchingByProfile: Record<string, Record<string, number>>;
  }) => void;
  setActiveProfile: (id: string) => void;
  addToMyList: (id: string) => void;
  removeFromMyList: (id: string) => void;
  updateProgress: (id: string, progress: number) => void;
  updateSettings: (settings: Partial<AppState["settings"]>) => void;
  logoutLocal: () => void;
}

async function persistUserState(state: AppState): Promise<void> {
  if (!state.user) return;
  await fetch("/api/user/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      profiles: state.profiles,
      activeProfileId: state.activeProfileId,
      myListByProfile: state.myListByProfile,
      continueWatchingByProfile: state.continueWatchingByProfile,
    }),
  });
}

function profileKey(state: AppState): string | null {
  return state.activeProfileId;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      user: null,
      profiles: [],
      activeProfileId: null,
      myListByProfile: {},
      continueWatchingByProfile: {},
      settings: {
        realDebridToken: "",
        tmdbApiKey: "",
        tvdbApiKey: "",
        libraryPath: "",
        plexUrl: "",
        plexToken: "",
        directPlay: true,
        plexOnly: true,
      },
      setUser: (user) => set({ user }),
      hydrateUserState: (payload) =>
        set({
          profiles: payload.profiles,
          activeProfileId: payload.activeProfileId,
          myListByProfile: payload.myListByProfile,
          continueWatchingByProfile: payload.continueWatchingByProfile,
        }),
      setActiveProfile: (id) => {
        set({ activeProfileId: id });
        void persistUserState(get());
      },
      addToMyList: (id) => {
        const pk = profileKey(get());
        if (!pk) return;
        const lists = get().myListByProfile;
        const current = lists[pk] ?? [];
        if (current.includes(id)) return;
        set({ myListByProfile: { ...lists, [pk]: [...current, id] } });
        void persistUserState(get());
      },
      removeFromMyList: (id) => {
        const pk = profileKey(get());
        if (!pk) return;
        const lists = get().myListByProfile;
        set({
          myListByProfile: {
            ...lists,
            [pk]: (lists[pk] ?? []).filter((x) => x !== id),
          },
        });
        void persistUserState(get());
      },
      updateProgress: (id, progress) => {
        const pk = profileKey(get());
        if (!pk) return;
        const all = get().continueWatchingByProfile;
        set({
          continueWatchingByProfile: {
            ...all,
            [pk]: { ...(all[pk] ?? {}), [id]: progress },
          },
        });
        void persistUserState(get());
      },
      updateSettings: (settings) => {
        set({ settings: { ...get().settings, ...settings } });
      },
      logoutLocal: () =>
        set({
          user: null,
          profiles: [],
          activeProfileId: null,
          myListByProfile: {},
          continueWatchingByProfile: {},
        }),
    }),
    {
      name: "netflix-clone-storage",
      partialize: (state) => ({
        settings: state.settings,
        user: state.user,
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

export function getMediaProgress(id: string): number {
  const s = useAppStore.getState();
  const pk = s.activeProfileId;
  if (!pk) return 0;
  return s.continueWatchingByProfile[pk]?.[id] ?? 0;
}

export function getContinueWatchingItems(allItems: MediaItem[]): MediaItem[] {
  const s = useAppStore.getState();
  const pk = s.activeProfileId;
  if (!pk) return [];
  const progress = s.continueWatchingByProfile[pk] ?? {};
  return allItems
    .filter((i) => progress[i.id] && progress[i.id] > 0 && progress[i.id] < 95)
    .map((i) => ({ ...i, progress: progress[i.id] }));
}
