import { NextRequest, NextResponse } from "next/server";
import { mergeSettingsForServerOps } from "@/lib/settings";
import { refreshPlexLibraries } from "@/lib/plex";
import { resolveLibraryPath } from "@/lib/library-path";
import {
  isLibrarySyncRunning,
  startBackgroundLibrarySync,
  buildLibraryCatalog,
} from "@/lib/library-sync";
import { readLibrarySyncState, syncProgressPercent } from "@/lib/library-sync-state";
import { readLibraryDatabase } from "@/lib/library-store";

export async function POST(request: NextRequest) {
  const settings = mergeSettingsForServerOps(request);

  try {
    if (settings.plexUrl && settings.plexToken) {
      if (isLibrarySyncRunning()) {
        const state = readLibrarySyncState();
        return NextResponse.json({
          success: true,
          running: true,
          message: "Library sync already in progress",
          sync: { ...state, percent: syncProgressPercent(state) },
        });
      }

      void refreshPlexLibraries(settings.plexUrl, settings.plexToken).catch((err) => {
        console.warn("[library/refresh] Plex section refresh failed:", err);
      });

      void startBackgroundLibrarySync(settings, { forceRefresh: true });

      const db = readLibraryDatabase();
      return NextResponse.json({
        success: true,
        running: true,
        titleCount: db?.items.length ?? 0,
        message: "Library sync started — watch the progress bar on Browse.",
        sync: {
          ...readLibrarySyncState(),
          percent: syncProgressPercent(readLibrarySyncState()),
        },
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
      running: false,
      refreshedAt: cache.cachedAt,
      titleCount: cache.items.length,
      featuredHeroId: cache.featuredHeroId,
      message: `Rescanned library path. Saved ${cache.items.length} titles to library database.`,
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
