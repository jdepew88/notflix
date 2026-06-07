import { NextRequest, NextResponse } from "next/server";
import { mergeSettings } from "@/lib/settings";
import { refreshPlexLibraries } from "@/lib/plex";
import { resolveLibraryPath } from "@/lib/library-path";
import { buildLibraryCatalog } from "@/lib/library-sync";

export async function POST(request: NextRequest) {
  const settings = mergeSettings(request);

  try {
    if (settings.plexUrl && settings.plexToken) {
      const refresh = await refreshPlexLibraries(settings.plexUrl, settings.plexToken);
      const cache = await buildLibraryCatalog(settings, { forceRefresh: true });
      return NextResponse.json({
        success: true,
        refreshedAt: cache.cachedAt,
        sectionsRefreshed: refresh.sections,
        sectionNames: refresh.names,
        titleCount: cache.items.length,
        featuredHeroId: cache.featuredHeroId,
        message: `Triggered refresh on ${refresh.sections} library section(s). Cached ${cache.items.length} titles.`,
      });
    }

    const libraryPath = resolveLibraryPath(settings.libraryPath);
    if (!libraryPath) {
      return NextResponse.json(
        { success: false, error: "Configure Plex or a library path first" },
        { status: 400 }
      );
    }

    const cache = await buildLibraryCatalog(settings, { forceRefresh: true });
    return NextResponse.json({
      success: true,
      refreshedAt: cache.cachedAt,
      titleCount: cache.items.length,
      featuredHeroId: cache.featuredHeroId,
      message: `Rescanned library path. Cached ${cache.items.length} titles.`,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Library refresh failed",
      },
      { status: 500 }
    );
  }
}
