"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { MediaItem, UserProfile } from "./types";

interface AppState {
  profiles: UserProfile[];
  activeProfileId: string | null;
  myList: string[];
  continueWatching: Record<string, number>;
  settings: {
    realDebridToken: string;
    tmdbApiKey: string;
    tvdbApiKey: string;
    libraryPath: string;
    plexUrl: string;
    plexToken: string;
    directPlay: boolean;
  };
  setActiveProfile: (id: string) => void;
  addToMyList: (id: string) => void;
  removeFromMyList: (id: string) => void;
  updateProgress: (id: string, progress: number) => void;
  updateSettings: (settings: Partial<AppState["settings"]>) => void;
}

const defaultProfiles: UserProfile[] = [
  { id: "1", name: "Joe", avatar: "👤" },
  { id: "2", name: "Kids", avatar: "🧒", isKids: true },
];

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      profiles: defaultProfiles,
      activeProfileId: null,
      myList: [],
      continueWatching: {},
      settings: {
        realDebridToken: "",
        tmdbApiKey: "",
        tvdbApiKey: "",
        libraryPath: "",
        plexUrl: "",
        plexToken: "",
        directPlay: true,
      },
      setActiveProfile: (id) => set({ activeProfileId: id }),
      addToMyList: (id) => {
        const { myList } = get();
        if (!myList.includes(id)) set({ myList: [...myList, id] });
      },
      removeFromMyList: (id) => {
        set({ myList: get().myList.filter((x) => x !== id) });
      },
      updateProgress: (id, progress) => {
        set({
          continueWatching: { ...get().continueWatching, [id]: progress },
        });
      },
      updateSettings: (settings) => {
        set({ settings: { ...get().settings, ...settings } });
      },
    }),
    { name: "netflix-clone-storage" }
  )
);

export function isInMyList(id: string): boolean {
  return useAppStore.getState().myList.includes(id);
}

export function getMediaProgress(id: string): number {
  return useAppStore.getState().continueWatching[id] ?? 0;
}
