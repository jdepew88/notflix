"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ensurePlexCookies,
  fetchWithSettings,
  getEffectiveSettings,
} from "@/lib/client-settings";
import { getContinueWatchingItems, useAppStore } from "@/lib/store";
import {
  filterRowItems,
  itemMatchesStreamingService,
  STREAMING_FILTER_EXEMPT_ROW_IDS,
  getStreamingServiceLabel,
  type StreamingServiceFilterId,
} from "@/lib/streaming-services";
import { HeroBanner } from "@/components/browse/HeroBanner";
import { ContentRow } from "@/components/browse/ContentRow";
import { StreamingServiceFilterBar } from "@/components/browse/StreamingServiceFilterBar";
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

function applyStreamingFilterToRows(
  rows: ContentRowData[],
  serviceId: StreamingServiceFilterId
): ContentRowData[] {
  if (serviceId === "all") return rows;

  return rows
    .map((row) => {
      if (STREAMING_FILTER_EXEMPT_ROW_IDS.has(row.id)) {
        return row;
      }
      return { ...row, items: filterRowItems(row.items, serviceId) };
    })
    .filter((row) => row.items.length > 0);
}

export function BrowseContent() {
  const storeSettings = useAppStore((s) => s.settings);
  const activeProfileId = useAppStore((s) => s.activeProfileId);
  const [allRows, setAllRows] = useState<ContentRowData[]>([]);
  const [hero, setHero] = useState<MediaItem | null>(null);
  const [heroVideoError, setHeroVideoError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [libraryStatus, setLibraryStatus] = useState<string>("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [streamingFilter, setStreamingFilter] = useState<StreamingServiceFilterId>("all");

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
          setHeroVideoError(libData.heroVideoError ?? null);
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

        setAllRows(newRows);
        setHero(pickHero(libraryItems, featuredHeroId, newRows[0]));
        setStreamingFilter("all");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [storeSettings, activeProfileId]);

  const filteredRows = useMemo(
    () => applyStreamingFilterToRows(allRows, streamingFilter),
    [allRows, streamingFilter]
  );

  const displayHero = useMemo(() => {
    if (streamingFilter === "all") return hero;
    if (!hero) return null;
    return itemMatchesStreamingService(hero, streamingFilter) ? hero : null;
  }, [hero, streamingFilter]);

  const settings = getEffectiveSettings(storeSettings);
  const configured = isLibraryConfigured(settings);
  const filterActive = streamingFilter !== "all";
  const filterEmpty = filterActive && filteredRows.length === 0 && allRows.length > 0;

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/30 border-t-white" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {displayHero && (
        <HeroBanner
          item={displayHero}
          videoError={heroVideoError}
          onHeroItemChange={(item, error) => {
            setHero(item);
            setHeroVideoError(error);
          }}
        />
      )}
      <div className={displayHero ? "-mt-16 relative z-10" : "pt-4"}>
        {allRows.length > 0 && (
          <StreamingServiceFilterBar
            active={streamingFilter}
            onChange={setStreamingFilter}
          />
        )}

        {filterEmpty ? (
          <div className="flex flex-col items-center justify-center px-4 py-16 text-center md:px-12">
            <p className="text-lg font-medium text-white">
              No titles on {getStreamingServiceLabel(streamingFilter)}
            </p>
            <p className="mt-2 max-w-md text-sm text-netflix-light-gray">
              Try another service or choose All. Titles need TMDB streaming data — add a TMDB API
              key in Settings if provider logos are missing.
            </p>
            <button
              type="button"
              onClick={() => setStreamingFilter("all")}
              className="mt-6 rounded bg-white px-6 py-2 text-sm font-semibold text-black hover:bg-white/80"
            >
              Show All
            </button>
          </div>
        ) : (
          filteredRows.map((row) => (
            <ContentRow key={row.id} title={row.title} items={row.items} />
          ))
        )}

        {allRows.length === 0 && (
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
        {libraryStatus && allRows.length > 0 && !filterEmpty && (
          <p className="px-4 pb-4 text-center text-xs text-netflix-gray md:px-12">{libraryStatus}</p>
        )}
      </div>
    </div>
  );
}