import { NextRequest, NextResponse } from "next/server";
import path from "path";
import {
  startHlsRemux,
  probeMediaUrl,
  probeMediaFile,
  type StreamTrack,
} from "@/lib/ffmpeg";
import { getLibraryPath } from "@/lib/env";
import { resolveStreamInput } from "@/lib/stream-source";

export async function GET(request: NextRequest) {
  const resolved = resolveStreamInput(request);
  const audio = request.nextUrl.searchParams.get("audio");
  const subtitle = request.nextUrl.searchParams.get("subtitle");

  if ((!resolved.url && !resolved.path) || audio === null) {
    return NextResponse.json(
      { error: resolved.error ?? "Missing url/session/path or audio track" },
      { status: 400 }
    );
  }

  const audioIndex = parseInt(audio, 10);
  const subtitleIndex =
    subtitle === null || subtitle === "" || subtitle === "-1"
      ? null
      : parseInt(subtitle, 10);

  try {
    let input = resolved.url ?? "";
    let subtitleCodec: string | undefined;
    let subtitlesForOrdinal: StreamTrack[] = [];

    if (resolved.path) {
      const libraryPath = getLibraryPath();
      if (!libraryPath) {
        return NextResponse.json({ error: "LIBRARY_PATH not configured" }, { status: 400 });
      }
      const filePath = path.resolve(resolved.path);
      const root = path.resolve(libraryPath);
      if (!filePath.startsWith(root)) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
      input = filePath;
      const probe = await probeMediaFile(filePath);
      subtitlesForOrdinal = probe.subtitles;
      if (subtitleIndex !== null) {
        subtitleCodec = probe.subtitles.find((s) => s.index === subtitleIndex)?.codec;
      }
    } else if (resolved.url) {
      const probe = await probeMediaUrl(resolved.url);
      subtitlesForOrdinal = probe.subtitles;
      if (subtitleIndex !== null) {
        subtitleCodec = probe.subtitles.find((s) => s.index === subtitleIndex)?.codec;
      }
    }

    const { session } = await startHlsRemux(
      input,
      audioIndex,
      subtitleIndex,
      subtitleCodec,
      subtitlesForOrdinal
    );
    return NextResponse.json({
      streamUrl: `/api/debrid/hls/${session}/master.m3u8`,
      session,
      mode: "remux",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Remux failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
