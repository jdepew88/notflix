import { NextRequest, NextResponse } from "next/server";
import {
  probeMediaFile,
  probeMediaUrl,
  startHlsTranscode,
  trackNeedsTranscode,
  type StreamTrack,
} from "@/lib/ffmpeg";
import { resolveAccessibleLibraryFile, resolveLibraryRoot } from "@/lib/library-playback";
import { mergeSettingsForServerOps } from "@/lib/settings";

export async function GET(request: NextRequest) {
  const settings = mergeSettingsForServerOps(request);
  const libraryRoot = resolveLibraryRoot(settings);
  const url = request.nextUrl.searchParams.get("url");
  const filePath = request.nextUrl.searchParams.get("path");
  const audio = request.nextUrl.searchParams.get("audio");
  const subtitle = request.nextUrl.searchParams.get("subtitle");
  let subtitleCodec = request.nextUrl.searchParams.get("subtitleCodec") ?? undefined;

  if ((!url && !filePath) || audio === null) {
    return NextResponse.json({ error: "Missing source or audio track" }, { status: 400 });
  }

  let input = url ?? "";
  if (filePath) {
    if (!libraryRoot) {
      return NextResponse.json({ error: "Library path not configured" }, { status: 400 });
    }
    const resolved = resolveAccessibleLibraryFile(filePath, libraryRoot);
    if (!resolved) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    input = resolved;
  }

  const audioIndex = parseInt(audio, 10);
  const subtitleIndex =
    subtitle === null || subtitle === "" || subtitle === "-1"
      ? null
      : parseInt(subtitle, 10);

  try {
    let transcodeVideo = false;
    let copyAudio = false;
    let subtitlesForOrdinal: StreamTrack[] = [];
    if (filePath && libraryRoot) {
      const resolved = resolveAccessibleLibraryFile(filePath, libraryRoot);
      if (resolved) {
        const probe = await probeMediaFile(resolved);
        subtitlesForOrdinal = probe.subtitles;
        transcodeVideo = probe.needsVideoTranscode || Boolean(probe.needsDirectVideoTranscode);
        const selectedAudio = probe.audio.find((a) => a.index === audioIndex);
        copyAudio = Boolean(selectedAudio && !trackNeedsTranscode(selectedAudio));
        if (subtitleIndex !== null && !subtitleCodec) {
          subtitleCodec = probe.subtitles.find((s) => s.index === subtitleIndex)?.codec;
        }
      }
    } else if (url) {
      const probe = await probeMediaUrl(url);
      subtitlesForOrdinal = probe.subtitles;
      transcodeVideo = probe.needsVideoTranscode || Boolean(probe.needsDirectVideoTranscode);
      const selectedAudio = probe.audio.find((a) => a.index === audioIndex);
      copyAudio = Boolean(selectedAudio && !trackNeedsTranscode(selectedAudio));
      if (subtitleIndex !== null && !subtitleCodec) {
        subtitleCodec = probe.subtitles.find((s) => s.index === subtitleIndex)?.codec;
      }
    }

    const { session } = await startHlsTranscode(
      input,
      audioIndex,
      subtitleIndex,
      subtitleCodec,
      subtitlesForOrdinal,
      transcodeVideo,
      copyAudio
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
