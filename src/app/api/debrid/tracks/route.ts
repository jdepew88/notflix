import { NextRequest, NextResponse } from "next/server";
import { probeMediaUrl, defaultAudioTrack, isFfmpegAvailable, getFfmpegInstallHint } from "@/lib/ffmpeg";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  try {
    const ffmpeg = await isFfmpegAvailable();
    if (!ffmpeg) {
      return NextResponse.json({
        error: "ffmpeg not found. " + getFfmpegInstallHint(),
        ffmpegRequired: true,
      }, { status: 503 });
    }

    const probe = await probeMediaUrl(url);
    return NextResponse.json({
      ...probe,
      defaultAudioIndex: defaultAudioTrack(probe.audio),
      defaultSubtitleIndex: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Probe failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
