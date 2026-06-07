import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { mergeSettings } from "@/lib/settings";
import { fetchPlexLibrary } from "@/lib/plex";
import { scanLibrary } from "@/lib/library";
import { getLibraryPath } from "@/lib/env";

export async function GET(request: NextRequest) {
  const settings = mergeSettings(request);
  const action = request.nextUrl.searchParams.get("action") ?? "all";

  if (action === "plex") {
    if (!settings.plexUrl || !settings.plexToken) {
      return NextResponse.json({ ok: false, error: "Plex URL and token not configured" });
    }
    try {
      const items = await fetchPlexLibrary(settings.plexUrl, settings.plexToken);
      return NextResponse.json({
        ok: true,
        message: `Plex reachable — ${items.length} titles found`,
        count: items.length,
      });
    } catch (err) {
      return NextResponse.json({
        ok: false,
        error: err instanceof Error ? err.message : "Plex unreachable",
      });
    }
  }

  if (action === "nfs" || action === "library") {
    const libraryPath = settings.libraryPath || getLibraryPath();
    if (!libraryPath) {
      return NextResponse.json({ ok: false, error: "LIBRARY_PATH not configured" });
    }
    try {
      if (!fs.existsSync(libraryPath)) {
        return NextResponse.json({
          ok: false,
          error: `Path does not exist: ${libraryPath}`,
        });
      }
      const stat = fs.statSync(libraryPath);
      if (!stat.isDirectory()) {
        return NextResponse.json({ ok: false, error: "Path is not a directory" });
      }
      fs.accessSync(libraryPath, fs.constants.R_OK);
      const items = await scanLibrary(libraryPath);
      return NextResponse.json({
        ok: true,
        message: `Media folder readable — ${items.length} video files found at ${libraryPath}`,
        count: items.length,
        path: libraryPath,
      });
    } catch (err) {
      return NextResponse.json({
        ok: false,
        error: err instanceof Error ? err.message : "Cannot read media folder",
        path: libraryPath,
      });
    }
  }

  const results: Record<string, unknown> = {};

  if (settings.plexUrl && settings.plexToken) {
    try {
      const items = await fetchPlexLibrary(settings.plexUrl, settings.plexToken);
      results.plex = { ok: true, count: items.length };
    } catch (err) {
      results.plex = {
        ok: false,
        error: err instanceof Error ? err.message : "Plex failed",
      };
    }
  } else {
    results.plex = { ok: false, error: "Not configured" };
  }

  const libraryPath = settings.libraryPath || getLibraryPath();
  if (libraryPath) {
    try {
      if (fs.existsSync(libraryPath) && fs.statSync(libraryPath).isDirectory()) {
        fs.accessSync(libraryPath, fs.constants.R_OK);
        const items = await scanLibrary(libraryPath);
        results.library = { ok: true, count: items.length, path: libraryPath };
      } else {
        results.library = { ok: false, error: `Missing: ${libraryPath}` };
      }
    } catch (err) {
      results.library = {
        ok: false,
        error: err instanceof Error ? err.message : "Read failed",
        path: libraryPath,
      };
    }
  } else {
    results.library = { ok: false, error: "Not configured" };
  }

  return NextResponse.json(results);
}
