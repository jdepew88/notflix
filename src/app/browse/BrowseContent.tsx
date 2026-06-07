"use client";

import { useEffect, useState } from "react";
import {
  ensurePlexCookies,
  fetchWithSettings,
  getEffectiveSettings,
} from "@/lib/client-settings";
import { getContinueWatchingItems, useAppStore } from "@/lib/store";
import { HeroBanner } from "@/components/browse/HeroBanner";
import { ContentRow } from "@/components/browse/ContentRow";
import type { MediaItem } from "@/lib/types";

interface ContentRowData {
  id: string;
  title: string;
  items: MediaItem[];
}

function pickHero(
  libraryItems: MediaItem[],
  featuredHeroId?: string | null,
  fallbackRow?: ContentRowData
): MediaItem | null {
  if (featuredHeroId) {
    const featured = libraryItems.find((i) => i.id === featuredHeroId);
    if (featured?.type === "movie") return featured;
  }
  return (
    libraryItems.find((i) => i.type === "movie") ??
    libraryItems[0] ??
    fallbackRow?.items[0] ??
    null
  );
}

function isLibraryConfigured(settings: ReturnType<typeof getEffectiveSettings>): boolean {
  return Boolean(
    (settings.plexUrl && settings.plexToken) || settings.libraryPath?.trim()
  );
}

export function BrowseContent() {
  const storeSettings = useAppStore((s) => s.settings);
  const activeProfileId = useAppStore((s) => s.activeProfileId);
  const [rows, setRows] = useState<ContentRowData[]>([]);
  const [hero, setHero] = useState<MediaItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [libraryStatus, setLibraryStatus] = useState<string>("");
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setLoadFailed(false);
      const settings = getEffectiveSettings(storeSettings);
      const onlyPlex = settings.plexOnly ?? true;

      try {
        const cookiesPromise =
          settings.plexUrl && settings.plexToken
            ? ensurePlexCookies(settings)
            : Promise.resolve();

        const [trendingRes, popularRes, libraryRes] = await Promise.all([
          !onlyPlex && settings.tmdbApiKey
            ? fetchWithSettings("/api/catalog?type=trending", settings)
            : Promise.resolve(null),
          !onlyPlex && settings.tmdbApiKey
            ? fetchWithSettings("/api/catalog?type=popular", settings)
            : Promise.resolve(null),
          fetchWithSettings("/api/library", settings),
          cookiesPromise,
        ]);

        const newRows: ContentRowData[] = [];
        let libraryItems: MediaItem[] = [];
        let hasPlexLibrary = false;
        let featuredHeroId: string | null = null;

        if (libraryRes.ok) {
          const libData = await libraryRes.json();
          libraryItems = libData.items ?? [];
          featuredHeroId = libData.featuredHeroId ?? null;
          hasPlexLibrary = libData.source === "plex" && libraryItems.length > 0;
          if (libData.message) setLibraryStatus(libData.message);
          else if (libData.count) {
            const cacheNote = libData.cached ? " (cached)" : "";
            setLibraryStatus(`Loaded ${libData.count} titles from ${libData.source}${cacheNote}`);
          }
          for (const row of libData.rows ?? []) {
            newRows.push(row);
          }
        } else {
          const err = await libraryRes.json().catch(() => ({}));
          setLoadFailed(true);
          setLibraryStatus(
            err.error || `Library load failed (${libraryRes.status}). Check Settings and try Save & Sync.`
          );
        }

        if (!onlyPlex && !hasPlexLibrary) {
          if (trendingRes?.ok) {
            const data = await trendingRes.json();
            if (data.items?.length) {
              newRows.unshift({ id: "trending", title: "Trending Now", items: data.items });
            }
          }

          if (popularRes?.ok) {
            const data = await popularRes.json();
            if (data.items?.length) {
              newRows.push({ id: "popular", title: "Popular on Netflix", items: data.items });
            }
          }
        }

        const continueItems = getContinueWatchingItems(libraryItems);
        if (continueItems.length > 0) {
          newRows.unshift({
            id: "continue-watching",
            title: "Continue Watching",
            items: continueItems,
          });
        }

        setRows(newRows);
        setHero(pickHero(libraryItems, featuredHeroId, newRows[0]));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [storeSettings, activeProfileId]);

  const settings = getEffectiveSettings(storeSettings);
  const configured = isLibraryConfigured(settings);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/30 border-t-white" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {hero && <HeroBanner item={hero} />}
      <div className={hero ? "-mt-16 relative z-10" : "pt-4"}>
        {rows.map((row) => (
          <ContentRow key={row.id} title={row.title} items={row.items} />
        ))}
        {rows.length === 0 && (
          <div className="flex flex-col items-center justify-center px-4 py-24 text-center">
            {loadFailed && configured ? (
              <>
                <h2 className="mb-4 text-2xl font-semibold">Could not load your library</h2>
                <p className="max-w-lg text-netflix-light-gray">
                  Settings look configured, but the library request failed. Open Settings and click{" "}
                  <strong className="text-white">Save & Sync Library</strong>, or use Force refresh
                  Plex if your token expired.
                </p>
                {libraryStatus && (
                  <p className="mt-4 text-sm text-yellow-400">{libraryStatus}</p>
                )}
                <a
                  href="/settings"
                  className="mt-6 rounded bg-netflix-red px-6 py-2 font-semibold hover:bg-netflix-red-hover"
                >
                  Open Settings
                </a>
              </>
            ) : (
              <>
                <h2 className="mb-4 text-2xl font-semibold">Connect your Plex library</h2>
                <p className="max-w-lg text-netflix-light-gray">
                  Go to Settings and enter your Plex server URL (e.g.{" "}
                  <code className="text-white">http://192.168.x.x:32400</code>), Plex token, and TVDB
                  API key. Click <strong className="text-white">Save & Sync Library</strong>, then
                  refresh this page.
                </p>
                {libraryStatus && (
                  <p className="mt-4 text-sm text-yellow-400">{libraryStatus}</p>
                )}
                <a
                  href="/settings"
                  className="mt-6 rounded bg-netflix-red px-6 py-2 font-semibold hover:bg-netflix-red-hover"
                >
                  Open Settings
                </a>
              </>
            )}
          </div>
        )}
        {libraryStatus && rows.length > 0 && (
          <p className="px-4 pb-4 text-center text-xs text-netflix-gray md:px-12">{libraryStatus}</p>
        )}
      </div>
    </div>
  );
}
