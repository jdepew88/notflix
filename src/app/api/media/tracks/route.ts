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
import { resolveStreamBody, resolveStreamInput } from "@/lib/stream-source";

async function probeFromResolved(resolved: {
  url: string | null;
  path: string | null;
  error?: string;
}) {
  if (resolved.error) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
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
      const probe = await probeMediaFile(filePath);
      return NextResponse.json(trackResponseDefaults(probe));
    }

    if (resolved.url) {
      const probe = await probeMediaUrl(resolved.url);
      return NextResponse.json(trackResponseDefaults(probe));
    }

    return NextResponse.json({ error: "Missing url, session, or path" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Probe failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const resolved = resolveStreamInput(request);
  if (!resolved.url && !resolved.path) {
    return NextResponse.json(
      { error: resolved.error ?? "Missing url, session, or path" },
      { status: 400 }
    );
  }
  return probeFromResolved(resolved);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      session?: string;
      url?: string;
      path?: string;
    };
    const resolved = await resolveStreamBody(body);
    return probeFromResolved(resolved);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
