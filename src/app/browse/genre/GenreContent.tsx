"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TitleCardWithHover } from "@/components/browse/TitleCardWithHover";
import { fetchWithSettings, getEffectiveSettings } from "@/lib/client-settings";
import { useAppStore } from "@/lib/store";
import type { MediaItem } from "@/lib/types";

export function GenreContent() {
  const searchParams = useSearchParams();
  const genreId = searchParams.get("id");
  const genreName = searchParams.get("name") ?? "Browse";
  const storeSettings = useAppStore((s) => s.settings);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<"plex" | "tmdb">("plex");
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadPlexGenre = useCallback(async () => {
    const settings = getEffectiveSettings(storeSettings);
    const res = await fetchWithSettings(
      `/api/library?genre=${encodeURIComponent(genreName)}`,
      settings
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.source === "plex" && (data.items?.length ?? 0) > 0) {
      return data.items as MediaItem[];
    }
    return null;
  }, [genreName, storeSettings]);

  const loadTmdbPage = useCallback(
    async (pageNum: number, append = false) => {
      if (!genreId || loadingRef.current) return;
      loadingRef.current = true;
      setLoading(true);
      try {
        const res = await fetch(
          `/api/catalog?type=genre&genreId=${genreId}&page=${pageNum}`
        );
        if (!res.ok) return;
        const data = await res.json();
        setItems((prev) => (append ? [...prev, ...data.items] : data.items));
        setTotalPages(data.totalPages);
        setPage(pageNum);
        setSource("tmdb");
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [genreId]
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setItems([]);

      const plexItems = await loadPlexGenre();
      if (cancelled) return;

      if (plexItems && plexItems.length > 0) {
        setItems(plexItems);
        setSource("plex");
        setTotalPages(1);
        setPage(1);
        setLoading(false);
        return;
      }

      if (genreId) {
        await loadTmdbPage(1, false);
      } else {
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [genreName, genreId, loadPlexGenre, loadTmdbPage]);

  useEffect(() => {
    if (source !== "tmdb") return;

    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && page < totalPages && !loadingRef.current) {
          loadTmdbPage(page + 1, true);
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [page, totalPages, loadTmdbPage, source]);

  return (
    <div className="min-h-screen px-4 py-8 md:px-12 lg:px-16">
      <h1 className="mb-2 text-2xl font-semibold md:text-3xl">{genreName}</h1>
      {source === "plex" && items.length > 0 && (
        <p className="mb-8 text-sm text-netflix-light-gray">
          {items.length} titles from your Plex library
        </p>
      )}
      {items.length === 0 && !loading && (
        <p className="mb-8 text-netflix-light-gray">
          No titles found in this genre. Sync your Plex library in Settings.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {items.map((item, i) => (
          <TitleCardWithHover
            key={`${item.id}-${i}`}
            item={item}
            className="w-full"
            priority={i < 6}
          />
        ))}
      </div>
      {source === "tmdb" && <div ref={sentinelRef} className="h-10" />}
      {loading && (
        <div className="flex justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-white/30 border-t-white" />
        </div>
      )}
    </div>
  );
}
