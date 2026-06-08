"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  HOME_TMDB_ROWS_INITIAL,
  HOME_TMDB_ROWS_MORE,
  fetchHomeTmdbRow,
} from "@/lib/home-rows";
import { HeroBanner } from "@/components/browse/HeroBanner";
import { ContentRow } from "@/components/browse/ContentRow";
import { LibrarySyncBar, type LibrarySyncStatus } from "@/components/browse/LibrarySyncBar";
import { StreamingServiceFilterBar } from "@/components/browse/StreamingServiceFilterBar";
import type { MediaItem } from "@/lib/types";

interface ContentRowData {
  id: string;
  title: string;
  items: MediaItem[];
  featured?: boolean;
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

async function loadTmdbHomeRows(
  defs: typeof HOME_TMDB_ROWS_INITIAL,
  settings: ReturnType<typeof getEffectiveSettings>
): Promise<ContentRowData[]> {
  const rows: ContentRowData[] = [];
  for (const def of defs) {
    const row = await fetchHomeTmdbRow(def, settings, fetchWithSettings);
    if (row) rows.push(row);
  }
  return rows;
}

export function BrowseContent() {
  const storeSettings = useAppStore((s) => s.settings);
  const activeProfileId = useAppStore((s) => s.activeProfileId);
  const [allRows, setAllRows] = useState<ContentRowData[]>([]);
  const [hero, setHero] = useState<MediaItem | null>(null);
  const [heroVideoError, setHeroVideoError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [libraryStatus, setLibraryStatus] = useState<string>("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [streamingFilter, setStreamingFilter] = useState<StreamingServiceFilterId>("all");
  const [moreRowIndex, setMoreRowIndex] = useState(0);
  const [moreRowsExhausted, setMoreRowsExhausted] = useState(false);
  const [syncStatus, setSyncStatus] = useState<LibrarySyncStatus | null>(null);
  const loadingMoreRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadGenerationRef = useRef(0);

  const buildRowsFromLibrary = useCallback(
    (
      libData: {
        items?: MediaItem[];
        rows?: ContentRowData[];
        featuredHeroId?: string | null;
        heroVideoError?: string | null;
        count?: number;
        source?: string;
        cached?: boolean;
        message?: string;
        syncing?: boolean;
        sync?: LibrarySyncStatus;
      },
      extraRows: ContentRowData[] = []
    ) => {
      const libraryItems = libData.items ?? [];
      const newRows: ContentRowData[] = [];

      for (const row of libData.rows ?? []) {
        newRows.push(row);
      }
      for (const row of extraRows) {
        newRows.push(row);
      }

      const continueItems = getContinueWatchingItems(libraryItems);
      if (continueItems.length > 0) {
        newRows.unshift({
          id: "continue-watching",
          title: "Continue Watching",
          items: continueItems,
        });
      }

      if (libData.heroVideoError !== undefined) {
        setHeroVideoError(libData.heroVideoError ?? null);
      }
      if (libData.message) setLibraryStatus(libData.message);
      else if (libData.count) {
        const cacheNote = libData.cached ? " (saved to library database)" : "";
        setLibraryStatus(`Loaded ${libData.count} titles from ${libData.source}${cacheNote}`);
      }
      if (libData.sync) setSyncStatus(libData.sync);
      else if (libData.syncing) {
        setSyncStatus((prev) => ({ ...prev, running: true, status: "running" }));
      }

      setAllRows(newRows);
      setHero(pickHero(libraryItems, libData.featuredHeroId, newRows[0]));
      return libraryItems.length;
    },
    []
  );

  const loadBrowse = useCallback(
    async (options: { refresh?: boolean } = {}) => {
      const generation = ++loadGenerationRef.current;
      setLoading(true);
      setLoadFailed(false);
      const settings = getEffectiveSettings(storeSettings);

      try {
        const cookiesPromise =
          settings.plexUrl && settings.plexToken
            ? ensurePlexCookies(settings)
            : Promise.resolve();

        const libraryUrl = options.refresh ? "/api/library?refresh=1" : "/api/library";
        const tmdbPromise =
          settings.tmdbApiKey && !settings.plexOnly
            ? loadTmdbHomeRows(HOME_TMDB_ROWS_INITIAL, settings)
            : Promise.resolve([] as ContentRowData[]);

        const [libraryRes, initialTmdbRows] = await Promise.all([
          fetchWithSettings(libraryUrl, settings),
          tmdbPromise,
          cookiesPromise,
        ]);

        if (generation !== loadGenerationRef.current) return;

        if (libraryRes.ok) {
          const libData = await libraryRes.json();
          const tmdbRows = settings.plexOnly ? [] : initialTmdbRows;
          const count = buildRowsFromLibrary(libData, tmdbRows);

          if (libData.syncing && count === 0) {
            setStreamingFilter("all");
            return;
          }
        } else {
          const err = await libraryRes.json().catch(() => ({}));
          setLoadFailed(true);
          setLibraryStatus(
            err.error || `Library load failed (${libraryRes.status}). Check Settings and try Save & Sync.`
          );
          if (!settings.plexOnly) {
            buildRowsFromLibrary({ items: [], rows: [] }, initialTmdbRows);
          } else {
            setAllRows([]);
          }
        }

        setStreamingFilter("all");
        setMoreRowIndex(0);
        setMoreRowsExhausted(false);
      } catch (err) {
        if (generation !== loadGenerationRef.current) return;
        setLoadFailed(true);
        setLibraryStatus(
          err instanceof Error ? err.message : "Failed to load library. Check Settings and try Save & Sync."
        );
      } finally {
        if (generation === loadGenerationRef.current) {
          setLoading(false);
        }
      }
    },
    [storeSettings, buildRowsFromLibrary]
  );

  useEffect(() => {
    void loadBrowse();
  }, [loadBrowse, activeProfileId]);

  const loadMoreRows = useCallback(async () => {
    if (loadingMoreRef.current || moreRowsExhausted) return;

    const settings = getEffectiveSettings(storeSettings);
    if (!settings.tmdbApiKey) {
      setMoreRowsExhausted(true);
      return;
    }

    loadingMoreRef.current = true;
    setLoadingMore(true);

    try {
      const batchSize = 3;
      let index = moreRowIndex;
      let added = 0;

      while (index < HOME_TMDB_ROWS_MORE.length && added < batchSize) {
        const def = HOME_TMDB_ROWS_MORE[index];
        index += 1;
        const row = await fetchHomeTmdbRow(def, settings, fetchWithSettings);
        if (row) {
          setAllRows((prev) => {
            if (prev.some((r) => r.id === row.id)) return prev;
            return [...prev, row];
          });
          added += 1;
        }
      }

      setMoreRowIndex(index);
      if (index >= HOME_TMDB_ROWS_MORE.length) {
        setMoreRowsExhausted(true);
      }
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [moreRowIndex, moreRowsExhausted, storeSettings]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || loading || moreRowsExhausted) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void loadMoreRows();
      },
      { rootMargin: "400px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loading, moreRowsExhausted, loadMoreRows]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function pollSync() {
      const res = await fetch("/api/library/sync").catch(() => null);
      if (cancelled || !res?.ok) return;

      const data = (await res.json()) as LibrarySyncStatus;
      setSyncStatus(data);

      const running = data.running || data.status === "running";
      if (running) {
        timer = setTimeout(pollSync, 1500);
        return;
      }

      if (data.status === "done" && allRows.filter((r) => r.id.startsWith("plex-")).length === 0) {
        void loadBrowse();
      } else if (data.status === "done") {
        void loadBrowse();
      }
    }

    const shouldPoll =
      syncStatus?.running ||
      syncStatus?.status === "running" ||
      (allRows.length === 0 && isLibraryConfigured(getEffectiveSettings(storeSettings)));

    if (shouldPoll) {
      void pollSync();
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [syncStatus?.running, syncStatus?.status, allRows.length, storeSettings, loadBrowse]);

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
      <LibrarySyncBar sync={syncStatus} />
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
            <ContentRow
              key={row.id}
              title={row.title}
              items={row.items}
              featured={row.featured || row.id === "plex-movies" || row.id === "plex-shows"}
            />
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
                  <code className="text-white">http://172.16.x.x:32400</code>), Plex token, and TVDB
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

        {!filterEmpty && settings.tmdbApiKey && !moreRowsExhausted && (
          <div ref={sentinelRef} className="flex justify-center py-8">
            {loadingMore && (
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-white/30 border-t-white" />
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
