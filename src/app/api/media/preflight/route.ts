import { NextRequest, NextResponse } from "next/server";
import {
  analyzePlaybackPreflight,
  type PlaybackPreflight,
} from "@/lib/playback-preflight";
import {
  getFfmpegInstallHint,
  isFfmpegAvailable,
  probeMediaFile,
  probeMediaUrl,
  trackResponseDefaults,
} from "@/lib/ffmpeg";
import { resolveAccessibleLibraryFile, resolveLibraryRoot } from "@/lib/library-playback";
import { mergeSettingsForServerOps } from "@/lib/settings";
import { resolveStreamBody, resolveStreamInput } from "@/lib/stream-source";

async function buildPreflight(
  resolved: { url: string | null; path: string | null; error?: string },
  libraryRoot: string,
  preferDirectPlay: boolean,
  subtitleIndex: number | null
): Promise<NextResponse> {
  if (resolved.error) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
  }

  const ffmpegAvailable = await isFfmpegAvailable();

  try {
    let probe;
    if (resolved.path) {
      if (!libraryRoot) {
        return NextResponse.json({ error: "Library path not configured" }, { status: 400 });
      }
      const filePath = resolveAccessibleLibraryFile(resolved.path, libraryRoot);
      if (!filePath) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
      probe = trackResponseDefaults(await probeMediaFile(filePath));
    } else if (resolved.url) {
      probe = trackResponseDefaults(await probeMediaUrl(resolved.url));
    } else {
      return NextResponse.json({ error: "Missing url, session, or path" }, { status: 400 });
    }

    const preflight: PlaybackPreflight = analyzePlaybackPreflight(probe, {
      ffmpegAvailable,
      preferDirectPlay,
      subtitleIndex,
    });

    return NextResponse.json({
      preflight,
      probe: {
        format: probe.format,
        videoCodec: probe.videoCodec,
        duration: probe.duration,
        audio: probe.audio,
        subtitles: probe.subtitles,
        defaultAudioIndex: probe.defaultAudioIndex,
        defaultSubtitleIndex: probe.defaultSubtitleIndex,
      },
      ffmpegAvailable,
      ffmpegHint: ffmpegAvailable ? undefined : getFfmpegInstallHint(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Probe failed";
    return NextResponse.json({ error: message, ffmpegAvailable }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const settings = mergeSettingsForServerOps(request);
  const libraryRoot = resolveLibraryRoot(settings);
  const resolved = resolveStreamInput(request);
  const preferDirectPlay = request.nextUrl.searchParams.get("directPlay") !== "0";
  const subtitleParam = request.nextUrl.searchParams.get("subtitle");
  const subtitleIndex =
    subtitleParam === null || subtitleParam === "" || subtitleParam === "-1"
      ? null
      : parseInt(subtitleParam, 10);

  return buildPreflight(resolved, libraryRoot, preferDirectPlay, subtitleIndex);
}

export async function POST(request: NextRequest) {
  const settings = mergeSettingsForServerOps(request);
  const libraryRoot = resolveLibraryRoot(settings);
  const body = (await request.json()) as {
    session?: string;
    url?: string;
    path?: string;
    directPlay?: boolean;
    subtitle?: number | null;
  };
  const resolved = await resolveStreamBody(body);
  const preferDirectPlay = body.directPlay !== false;
  const subtitleIndex =
    body.subtitle === null || body.subtitle === undefined ? null : body.subtitle;

  return buildPreflight(resolved, libraryRoot, preferDirectPlay, subtitleIndex);
}
