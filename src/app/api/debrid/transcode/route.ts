import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { startHlsTranscode, probeMediaUrl, probeMediaFile, type StreamTrack } from "@/lib/ffmpeg";
import { getLibraryPath } from "@/lib/env";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  const filePath = request.nextUrl.searchParams.get("path");
  const audio = request.nextUrl.searchParams.get("audio");
  const subtitle = request.nextUrl.searchParams.get("subtitle");

  if ((!url && !filePath) || audio === null) {
    return NextResponse.json({ error: "Missing url/path or audio track" }, { status: 400 });
  }

  const audioIndex = parseInt(audio, 10);
  const subtitleIndex =
    subtitle === null || subtitle === "" || subtitle === "-1"
      ? null
      : parseInt(subtitle, 10);

  try {
    let input = url ?? "";
    let subtitleCodec: string | undefined;
    let subtitlesForOrdinal: StreamTrack[] = [];

    if (filePath) {
      const libraryPath = getLibraryPath();
      if (!libraryPath) {
        return NextResponse.json({ error: "LIBRARY_PATH not configured" }, { status: 400 });
      }
      const resolved = path.resolve(filePath);
      const root = path.resolve(libraryPath);
      if (!resolved.startsWith(root)) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
      input = resolved;
      const probe = await probeMediaFile(resolved);
      subtitlesForOrdinal = probe.subtitles;
      if (subtitleIndex !== null) {
        subtitleCodec = probe.subtitles.find((s) => s.index === subtitleIndex)?.codec;
      }
    } else if (url) {
      const probe = await probeMediaUrl(url);
      subtitlesForOrdinal = probe.subtitles;
      if (subtitleIndex !== null) {
        subtitleCodec = probe.subtitles.find((s) => s.index === subtitleIndex)?.codec;
      }
    }

    const { session } = await startHlsTranscode(
      input,
      audioIndex,
      subtitleIndex,
      subtitleCodec,
      subtitlesForOrdinal
    );
    return NextResponse.json({
      streamUrl: `/api/debrid/hls/${session}/master.m3u8`,
      session,
      mode: "hls",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transcode failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
