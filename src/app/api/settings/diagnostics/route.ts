import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { mergeSettings } from "@/lib/settings";
import { fetchPlexLibrary } from "@/lib/plex";
import { scanLibrary } from "@/lib/library";
import {
  CONTAINER_VIDEO_PATH,
  HOST_MEDIA_PATH,
  libraryPathHint,
  mapHostPathToContainer,
  resolveLibraryPath,
} from "@/lib/library-path";
import { listMediaMountSubdirs, suggestLibraryPaths } from "@/lib/library-path-server";

function testLibraryPath(libraryPath: string, rawPath?: string) {
  if (!libraryPath) {
    return { ok: false, error: "No library path configured" };
  }
  if (!fs.existsSync(libraryPath)) {
    const hint = rawPath ? libraryPathHint(rawPath) : undefined;
    const suggestions = suggestLibraryPaths();
    const subdirs = listMediaMountSubdirs();
    return {
      ok: false,
      error: `Path does not exist: ${libraryPath}`,
      path: libraryPath,
      hostHint: HOST_MEDIA_PATH,
      containerHint: CONTAINER_VIDEO_PATH,
      hint,
      suggestions,
      availableSubdirs: subdirs,
    };
  }
  const stat = fs.statSync(libraryPath);
  if (!stat.isDirectory()) {
    return { ok: false, error: "Path is not a directory", path: libraryPath };
  }
  fs.accessSync(libraryPath, fs.constants.R_OK);
  return { ok: true, path: libraryPath, readable: true };
}

export async function GET(request: NextRequest) {
  const settings = mergeSettings(request);
  const action = request.nextUrl.searchParams.get("action") ?? "all";
  const pathOverride = request.nextUrl.searchParams.get("path") ?? undefined;
  const rawLibraryPath = pathOverride || settings.libraryPath?.trim() || "";
  const libraryPath = pathOverride
    ? mapHostPathToContainer(pathOverride)
    : resolveLibraryPath(settings.libraryPath);

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

  if (action === "nfs" || action === "library" || action === "video") {
    const targetPath =
      action === "video"
        ? mapHostPathToContainer(pathOverride || CONTAINER_VIDEO_PATH)
        : libraryPath;
    const rawTarget = pathOverride || rawLibraryPath || CONTAINER_VIDEO_PATH;

    if (!targetPath) {
      return NextResponse.json({
        ok: false,
        error: "LIBRARY_PATH not configured",
        hostHint: HOST_MEDIA_PATH,
        containerHint: CONTAINER_VIDEO_PATH,
      });
    }

    try {
      const access = testLibraryPath(targetPath, rawTarget);
      if (!access.ok) {
        return NextResponse.json({
          ...access,
          hostHint: HOST_MEDIA_PATH,
          containerHint: CONTAINER_VIDEO_PATH,
        });
      }

      const items = await scanLibrary(targetPath);
      return NextResponse.json({
        ok: true,
        message: `Video folder readable — ${items.length} video files at ${targetPath}`,
        count: items.length,
        path: targetPath,
        hostHint: HOST_MEDIA_PATH,
      });
    } catch (err) {
      return NextResponse.json({
        ok: false,
        error: err instanceof Error ? err.message : "Cannot read media folder",
        path: targetPath,
        hostHint: HOST_MEDIA_PATH,
        containerHint: CONTAINER_VIDEO_PATH,
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

  if (libraryPath) {
    try {
      const access = testLibraryPath(libraryPath, rawLibraryPath);
      if (!access.ok) {
        results.library = access;
      } else {
        const items = await scanLibrary(libraryPath);
        results.library = { ok: true, count: items.length, path: libraryPath };
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

  try {
    const access = testLibraryPath(CONTAINER_VIDEO_PATH);
    if (access.ok) {
      const items = await scanLibrary(CONTAINER_VIDEO_PATH);
      results.videoFolder = {
        ok: true,
        count: items.length,
        path: CONTAINER_VIDEO_PATH,
        hostHint: HOST_MEDIA_PATH,
      };
    } else {
      results.videoFolder = {
        ...access,
        hostHint: HOST_MEDIA_PATH,
        containerHint: CONTAINER_VIDEO_PATH,
      };
    }
  } catch (err) {
    results.videoFolder = {
      ok: false,
      error: err instanceof Error ? err.message : "Read failed",
      path: CONTAINER_VIDEO_PATH,
      hostHint: HOST_MEDIA_PATH,
    };
  }

  return NextResponse.json(results);
}
