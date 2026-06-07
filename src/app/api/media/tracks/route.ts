import { NextRequest, NextResponse } from "next/server";
import path from "path";
import {
  getFfmpegInstallHint,
  isFfmpegAvailable,
  probeMediaFile,
  probeMediaUrl,
  trackResponseDefaults,
} from "@/lib/ffmpeg";
import { getLibraryPath } from "@/lib/env";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  const filePath = request.nextUrl.searchParams.get("path");

  if (!url && !filePath) {
    return NextResponse.json({ error: "Missing url or path" }, { status: 400 });
  }

  try {
    const ffmpeg = await isFfmpegAvailable();
    if (!ffmpeg) {
      return NextResponse.json(
        {
          error: "ffmpeg not found. " + getFfmpegInstallHint(),
          ffmpegRequired: true,
        },
        { status: 503 }
      );
    }

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
      const probe = await probeMediaFile(resolved);
      return NextResponse.json(trackResponseDefaults(probe));
    }

    const probe = await probeMediaUrl(url!);
    return NextResponse.json(trackResponseDefaults(probe));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Probe failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
