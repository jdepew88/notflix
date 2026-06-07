import { NextRequest, NextResponse } from "next/server";
import { startHlsTranscode } from "@/lib/ffmpeg";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  const audio = request.nextUrl.searchParams.get("audio");
  const subtitle = request.nextUrl.searchParams.get("subtitle");

  if (!url || audio === null) {
    return NextResponse.json({ error: "Missing url or audio track" }, { status: 400 });
  }

  const audioIndex = parseInt(audio, 10);
  const subtitleIndex =
    subtitle === null || subtitle === "" || subtitle === "-1"
      ? null
      : parseInt(subtitle, 10);

  try {
    const { session } = await startHlsTranscode(url, audioIndex, subtitleIndex);
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
