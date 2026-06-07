import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { startHlsTranscode } from "@/lib/ffmpeg";
import { getLibraryPath } from "@/lib/env";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  const filePath = request.nextUrl.searchParams.get("path");
  const audio = request.nextUrl.searchParams.get("audio");
  const subtitle = request.nextUrl.searchParams.get("subtitle");
  const subtitleCodec = request.nextUrl.searchParams.get("subtitleCodec") ?? undefined;

  if ((!url && !filePath) || audio === null) {
    return NextResponse.json({ error: "Missing source or audio track" }, { status: 400 });
  }

  let input = url ?? "";
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
  }

  const audioIndex = parseInt(audio, 10);
  const subtitleIndex =
    subtitle === null || subtitle === "" || subtitle === "-1"
      ? null
      : parseInt(subtitle, 10);

  try {
    const { session } = await startHlsTranscode(
      input,
      audioIndex,
      subtitleIndex,
      subtitleCodec,
      []
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
