import { NextRequest, NextResponse } from "next/server";
import { mergeSettings } from "@/lib/settings";
import { filterByGenre } from "@/lib/plex";
import { resolveLibraryPath } from "@/lib/library-path";
import {
  cacheMatchesSettings,
  readLibraryCache,
} from "@/lib/library-cache";
import { buildLibraryCatalog } from "@/lib/library-sync";

export async function GET(request: NextRequest) {
  const settings = mergeSettings(request);
  const genreFilter = request.nextUrl.searchParams.get("genre");
  const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";

  const hasPlexUrl = Boolean(settings.plexUrl?.trim());
  const hasPlexToken = Boolean(settings.plexToken?.trim());
  const libraryPath = resolveLibraryPath(settings.libraryPath);

  try {
    if (hasPlexUrl && !hasPlexToken) {
      return NextResponse.json(
        { error: "Plex token required. Sign in with Plex or paste a token in Settings." },
        { status: 400 }
      );
    }
    if (hasPlexToken && !hasPlexUrl) {
      return NextResponse.json(
        { error: "Plex server URL required in Settings." },
        { status: 400 }
      );
    }
    if (!hasPlexUrl && !hasPlexToken && !libraryPath) {
      return NextResponse.json({
        items: [],
        rows: [],
        source: "none",
        message:
          "Configure Plex URL + token or library path in Settings, then click Save & Sync Library.",
      });
    }

    let cache = !forceRefresh ? readLibraryCache() : null;
    let servedFromCache = false;
    if (cache && cacheMatchesSettings(cache, settings)) {
      servedFromCache = true;
    } else {
      cache = null;
    }

    if (!cache) {
      cache = await buildLibraryCatalog(settings, { forceRefresh });
      servedFromCache = false;
    }

    const genres = cache.genres;

    if (genreFilter) {
      const items = filterByGenre(cache.items, genreFilter);
      return NextResponse.json({
        items,
        rows: [],
        source: cache.source,
        count: items.length,
        genre: genreFilter,
        genres,
        cachedAt: cache.cachedAt,
      });
    }

    return NextResponse.json({
      items: cache.items,
      rows: cache.rows,
      source: cache.source,
      count: cache.items.length,
      genres,
      featuredHeroId: cache.featuredHeroId,
      cached: servedFromCache,
      cachedAt: cache.cachedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load library";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
