"use client";

import { useEffect, useState } from "react";
import { TitleCard } from "@/components/browse/TitleCard";
import { useAppStore } from "@/lib/store";
import type { MediaItem } from "@/lib/types";

export default function MyListPage() {
  const myList = useAppStore((s) => s.myList);
  const continueWatching = useAppStore((s) => s.continueWatching);
  const [allItems, setAllItems] = useState<MediaItem[]>([]);

  useEffect(() => {
    async function load() {
      const [catalogRes, libraryRes] = await Promise.all([
        fetch("/api/catalog?type=trending"),
        fetch("/api/library"),
      ]);
      const items: MediaItem[] = [];
      if (catalogRes.ok) {
        const data = await catalogRes.json();
        items.push(...(data.items ?? []));
      }
      if (libraryRes.ok) {
        const data = await libraryRes.json();
        items.push(...(data.items ?? []));
      }
      setAllItems(items);
    }
    load();
  }, []);

  const listItems = allItems.filter((i) => myList.includes(i.id));
  const continueItems = allItems
    .filter((i) => continueWatching[i.id] && continueWatching[i.id] > 0 && continueWatching[i.id] < 95)
    .map((i) => ({ ...i, progress: continueWatching[i.id] }));

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
