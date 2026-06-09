import { NextRequest, NextResponse } from "next/server";
import { mergeSettingsForServerOps } from "@/lib/settings";
import { fetchPlexLibrary } from "@/lib/plex";
import { testTvdbConnection } from "@/lib/tvdb";
import { getTrending } from "@/lib/tmdb";
import {
  analyzePlaybackPreflight,
  prepEstimateLabel,
  strategyLabel,
} from "@/lib/playback-preflight";
import {
  getFfmpegInstallHint,
  getFfmpegPath,
  isFfmpegAvailable,
  probeMediaFile,
  trackResponseDefaults,
} from "@/lib/ffmpeg";
import {
  CONTAINER_MEDIA_PATH,
  CONTAINER_VIDEO_PATH,
  HOST_MEDIA_PATH,
  libraryPathHint,
  mapHostPathToContainer,
  resolveLibraryPath,
} from "@/lib/library-path";

async function loadFs() {
  return import("node:fs");
}

async function scanLibraryAt(targetPath: string) {
  const { scanLibrary } = await import("@/lib/library");
  return scanLibrary(targetPath);
}

async function listMediaMountSubdirs(): Promise<string[]> {
  try {
    const fs = await loadFs();
    if (!fs.existsSync(CONTAINER_MEDIA_PATH)) return [];
    return fs
      .readdirSync(CONTAINER_MEDIA_PATH, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => `${CONTAINER_MEDIA_PATH}/${e.name}`)
      .slice(0, 12);
  } catch {
    return [];
  }
}

async function suggestLibraryPaths(): Promise<string[]> {
  const fs = await loadFs();
  const candidates = [
    CONTAINER_VIDEO_PATH,
    `${CONTAINER_MEDIA_PATH}/Movies`,
    `${CONTAINER_MEDIA_PATH}/TV`,
    CONTAINER_MEDIA_PATH,
  ];
  return candidates.filter((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });
}

async function testLibraryPath(libraryPath: string, rawPath?: string) {
  if (!libraryPath) {
    return { ok: false as const, error: "No library path configured" };
  }

  const fs = await loadFs();
  if (!fs.existsSync(libraryPath)) {
    const hint = rawPath ? libraryPathHint(rawPath) : undefined;
    const [suggestions, subdirs] = await Promise.all([
      suggestLibraryPaths(),
      listMediaMountSubdirs(),
    ]);
    return {
      ok: false as const,
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
    return { ok: false as const, error: "Path is not a directory", path: libraryPath };
  }
  fs.accessSync(libraryPath, fs.constants.R_OK);
  return { ok: true as const, path: libraryPath, readable: true };
}

export async function GET(request: NextRequest) {
  const settings = mergeSettingsForServerOps(request);
  const action = request.nextUrl.searchParams.get("action") ?? "all";
  const pathOverride = request.nextUrl.searchParams.get("path") ?? undefined;
  const rawLibraryPath = pathOverride || settings.libraryPath?.trim() || "";
  const libraryPath = pathOverride
    ? mapHostPathToContainer(pathOverride)
    : resolveLibraryPath(settings.libraryPath);

  if (action === "ffmpeg") {
    const available = await isFfmpegAvailable();
    return NextResponse.json({
      ok: available,
      path: getFfmpegPath(),
      hint: available ? undefined : getFfmpegInstallHint(),
    });
  }

  if (action === "metadata") {
    const results: Record<string, { ok: boolean; message?: string; error?: string }> = {};

    if (settings.tmdbApiKey) {
      try {
        const items = await getTrending(settings.tmdbApiKey);
        results.tmdb = {
          ok: items.length > 0,
          message: items.length ? `TMDB OK — ${items.length} trending titles` : "TMDB returned no results",
        };
      } catch (err) {
        results.tmdb = {
          ok: false,
          error: err instanceof Error ? err.message : "TMDB failed",
        };
      }
    } else {
      results.tmdb = { ok: false, error: "Not configured" };
    }

    if (settings.tvdbApiKey) {
      const tvdb = await testTvdbConnection(settings.tvdbApiKey);
      results.tvdb = tvdb.ok
        ? { ok: true, message: "TVDB login OK" }
        : { ok: false, error: tvdb.error ?? "TVDB failed" };
    } else {
      results.tvdb = { ok: false, error: "Not configured" };
    }

    if (settings.realDebridToken) {
      try {
        const res = await fetch("https://api.real-debrid.com/rest/1.0/user", {
          headers: { Authorization: `Bearer ${settings.realDebridToken}` },
        });
        if (res.ok) {
          const user = (await res.json()) as { username?: string; premium?: number };
          results.debrid = {
            ok: true,
            message: `${user.username ?? "RD user"} · ${user.premium ? "Premium" : "Free"}`,
          };
        } else {
          results.debrid = { ok: false, error: `Real-Debrid HTTP ${res.status}` };
        }
      } catch (err) {
        results.debrid = {
          ok: false,
          error: err instanceof Error ? err.message : "Real-Debrid unreachable",
        };
      }
    } else {
      results.debrid = { ok: false, error: "Not configured" };
    }

    return NextResponse.json({ ok: Object.values(results).some((r) => r.ok), results });
  }

  if (action === "playback") {
    const ffmpegAvailable = await isFfmpegAvailable();
    const samplePath = request.nextUrl.searchParams.get("path") ?? undefined;
    let sampleFile: string | undefined;
    let sampleTitle: string | undefined;

    if (samplePath) {
      const mapped = mapHostPathToContainer(samplePath);
      sampleFile = mapped;
      sampleTitle = mapped.split("/").pop();
    } else if (libraryPath) {
      try {
        const items = await scanLibraryAt(libraryPath);
        const mkv = items.find((i) => i.filePath?.toLowerCase().endsWith(".mkv"));
        const pick = mkv ?? items[0];
        if (pick?.filePath) {
          sampleFile = pick.filePath;
          sampleTitle = pick.title;
        }
      } catch {
        /* ignore */
      }
    }

    let preflightSummary: Record<string, unknown> | undefined;
    if (sampleFile) {
      try {
        const probe = trackResponseDefaults(await probeMediaFile(sampleFile));
        const preflight = analyzePlaybackPreflight(probe, {
          ffmpegAvailable,
          preferDirectPlay: settings.directPlay,
        });
        preflightSummary = {
          title: sampleTitle,
          path: sampleFile,
          strategy: strategyLabel(preflight.strategy),
          prep: prepEstimateLabel(preflight.prepEstimate),
          video: preflight.videoCodec,
          audio: preflight.defaultAudioCodec,
          format: preflight.format,
          reasons: preflight.reasons,
          warnings: preflight.warnings,
        };
      } catch (err) {
        preflightSummary = {
          title: sampleTitle,
          path: sampleFile,
          error: err instanceof Error ? err.message : "Probe failed",
        };
      }
    }

    return NextResponse.json({
      ok: ffmpegAvailable,
      ffmpeg: {
        ok: ffmpegAvailable,
        path: getFfmpegPath(),
        hint: ffmpegAvailable ? undefined : getFfmpegInstallHint(),
      },
      sample: preflightSummary ?? { error: "No video file found to probe in library" },
      directPlaySetting: settings.directPlay,
      plexOnly: settings.plexOnly,
    });
  }

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
      const access = await testLibraryPath(targetPath, rawTarget);
      if (!access.ok) {
        return NextResponse.json({
          ...access,
          hostHint: HOST_MEDIA_PATH,
          containerHint: CONTAINER_VIDEO_PATH,
        });
      }

      const items = await scanLibraryAt(targetPath);
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
      const access = await testLibraryPath(libraryPath, rawLibraryPath);
      if (!access.ok) {
        results.library = access;
      } else {
        const items = await scanLibraryAt(libraryPath);
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
    const access = await testLibraryPath(CONTAINER_VIDEO_PATH);
    if (access.ok) {
      const items = await scanLibraryAt(CONTAINER_VIDEO_PATH);
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
