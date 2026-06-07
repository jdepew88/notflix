"use client";

import { useEffect, useState } from "react";
import { TitleCard } from "@/components/browse/TitleCard";
import {
  fetchWithSettings,
  getEffectiveSettings,
} from "@/lib/client-settings";
import {
  getActiveMyList,
  getContinueWatchingItems,
  useAppStore,
} from "@/lib/store";
import type { MediaItem } from "@/lib/types";

export default function MyListPage() {
  const storeSettings = useAppStore((s) => s.settings);
  const activeProfileId = useAppStore((s) => s.activeProfileId);
  const myListByProfile = useAppStore((s) => s.myListByProfile);
  const [allItems, setAllItems] = useState<MediaItem[]>([]);

  useEffect(() => {
    async function load() {
      const settings = getEffectiveSettings(storeSettings);
      const onlyPlex = settings.plexOnly ?? true;
      const items: MediaItem[] = [];

      const libraryRes = await fetchWithSettings("/api/library", settings);
      if (libraryRes.ok) {
        const data = await libraryRes.json();
        items.push(...(data.items ?? []));
      }

      if (!onlyPlex && settings.tmdbApiKey) {
        const catalogRes = await fetchWithSettings("/api/catalog?type=trending", settings);
        if (catalogRes.ok) {
          const data = await catalogRes.json();
          items.push(...(data.items ?? []));
        }
      }

      setAllItems(items);
    }
    load();
  }, [storeSettings]);

  const myList = activeProfileId ? myListByProfile[activeProfileId] ?? [] : getActiveMyList();
  const listItems = allItems.filter((i) => myList.includes(i.id));
  const continueItems = getContinueWatchingItems(allItems);

  return (
    <div className="min-h-screen px-4 py-8 md:px-12 lg:px-16">
      {continueItems.length > 0 && (
        <section className="mb-10">
          <h1 className="mb-4 text-2xl font-semibold md:text-3xl">Continue Watching</h1>
          <div className="flex flex-wrap gap-3">
            {continueItems.map((item) => (
              <TitleCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h1 className="mb-4 text-2xl font-semibold md:text-3xl">My List</h1>
        {listItems.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            {listItems.map((item) => (
              <TitleCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <p className="text-netflix-light-gray">
            Your list is empty. Add titles from any detail page.
          </p>
        )}
      </section>
    </div>
  );
}
