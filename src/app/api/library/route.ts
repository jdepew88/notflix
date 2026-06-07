import { NextRequest, NextResponse } from "next/server";
import { mergeSettings } from "@/lib/settings";
import { fetchPlexLibrary, buildContentRowsFromPlex, filterByGenre, collectGenres } from "@/lib/plex";
import { scanLibrary, buildContentRows } from "@/lib/library";
import { enrichLibraryWithTmdb } from "@/lib/tmdb";
import { enrichWithTvdb } from "@/lib/tvdb";

export async function GET(request: NextRequest) {
  const settings = mergeSettings(request);
  const genreFilter = request.nextUrl.searchParams.get("genre");

  try {
    let items = [];
    let source = "none";

    if (settings.plexUrl && settings.plexToken) {
      items = await fetchPlexLibrary(settings.plexUrl, settings.plexToken);
      source = "plex";
    } else if (settings.libraryPath) {
      items = await scanLibrary(settings.libraryPath);
      source = "nfs";
    } else {
      return NextResponse.json({
        items: [],
        rows: [],
        source: "none",
        message:
          "Configure Plex URL + token or library path in Settings, then click Save & Sync Library.",
      });
    }

    if (settings.tvdbApiKey && items.length > 0) {
      items = await enrichWithTvdb(items, settings.tvdbApiKey);
    } else if (settings.tmdbApiKey && items.length > 0) {
      items = await enrichLibraryWithTmdb(items, settings.tmdbApiKey);
    }

    const genres = collectGenres(items);

    if (genreFilter) {
      items = filterByGenre(items, genreFilter);
      return NextResponse.json({
        items,
        rows: [],
        source,
        count: items.length,
        genre: genreFilter,
        genres,
      });
    }

    const rows =
      source === "plex"
        ? buildContentRowsFromPlex(items)
        : buildContentRows(items);

    return NextResponse.json({ items, rows, source, count: items.length, genres });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load library";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
