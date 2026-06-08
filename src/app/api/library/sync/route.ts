import { NextRequest, NextResponse } from "next/server";
import { mergeSettingsForServerOps } from "@/lib/settings";
import {
  isLibrarySyncRunning,
  startBackgroundLibrarySync,
  buildLibraryCatalog,
} from "@/lib/library-sync";
import {
  readLibrarySyncState,
  syncProgressPercent,
} from "@/lib/library-sync-state";

export async function GET() {
  const state = readLibrarySyncState();
  return NextResponse.json({
    ...state,
    percent: syncProgressPercent(state),
    running: isLibrarySyncRunning(),
  });
}

export async function POST(request: NextRequest) {
  const settings = mergeSettingsForServerOps(request);
  const force = request.nextUrl.searchParams.get("force") === "1";

  if (!settings.plexUrl?.trim() && !settings.libraryPath?.trim()) {
    return NextResponse.json(
      { error: "Configure Plex or a library path first" },
      { status: 400 }
    );
  }

  if (isLibrarySyncRunning()) {
    const state = readLibrarySyncState();
    return NextResponse.json({
      started: false,
      running: true,
      ...state,
      percent: syncProgressPercent(state),
    });
  }

  if (force) {
    try {
      const cache = await buildLibraryCatalog(settings, { forceRefresh: true });
      const state = readLibrarySyncState();
      return NextResponse.json({
        started: true,
        running: false,
        done: true,
        titleCount: cache.items.length,
        ...state,
        percent: 100,
      });
    } catch (err) {
      const state = readLibrarySyncState();
      const message = err instanceof Error ? err.message : "Library sync failed";
      return NextResponse.json(
        { started: true, running: false, error: message, ...state },
        { status: 500 }
      );
    }
  }

  void startBackgroundLibrarySync(settings, { forceRefresh: true });
  const state = readLibrarySyncState();
  return NextResponse.json({
    started: true,
    running: true,
    ...state,
    percent: syncProgressPercent(state),
  });
}
