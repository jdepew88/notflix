import { NextRequest, NextResponse } from "next/server";
import {
  startHlsRemux,
  probeMediaUrl,
  probeMediaFile,
  type StreamTrack,
} from "@/lib/ffmpeg";
import { resolveAccessibleLibraryFile, resolveLibraryRoot } from "@/lib/library-playback";
import { mergeSettingsForServerOps } from "@/lib/settings";
import { resolveStreamInput } from "@/lib/stream-source";

export async function GET(request: NextRequest) {
  const settings = mergeSettingsForServerOps(request);
  const libraryRoot = resolveLibraryRoot(settings);
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
      if (!libraryRoot) {
        return NextResponse.json({ error: "Library path not configured" }, { status: 400 });
      }
      const filePath = resolveAccessibleLibraryFile(resolved.path, libraryRoot);
      if (!filePath) {
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
