import { NextRequest, NextResponse } from "next/server";
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

async function probeFromResolved(
  resolved: {
    url: string | null;
    path: string | null;
    error?: string;
  },
  libraryRoot: string
) {
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
      if (!libraryRoot) {
        return NextResponse.json({ error: "Library path not configured" }, { status: 400 });
      }
      const filePath = resolveAccessibleLibraryFile(resolved.path, libraryRoot);
      if (!filePath) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
      const probe = await probeMediaFile(filePath);
      return NextResponse.json({ ...trackResponseDefaults(probe), ffmpegAvailable: true });
    }

    if (resolved.url) {
      const probe = await probeMediaUrl(resolved.url);
      return NextResponse.json({ ...trackResponseDefaults(probe), ffmpegAvailable: true });
    }

    return NextResponse.json({ error: "Missing url, session, or path" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Probe failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const settings = mergeSettingsForServerOps(request);
  const libraryRoot = resolveLibraryRoot(settings);
  const resolved = resolveStreamInput(request);
  if (!resolved.url && !resolved.path) {
    return NextResponse.json(
      { error: resolved.error ?? "Missing url, session, or path" },
      { status: 400 }
    );
  }
  return probeFromResolved(resolved, libraryRoot);
}

export async function POST(request: NextRequest) {
  try {
    const settings = mergeSettingsForServerOps(request);
    const libraryRoot = resolveLibraryRoot(settings);
    const body = (await request.json()) as {
      session?: string;
      url?: string;
      path?: string;
    };
    const resolved = await resolveStreamBody(body);
    return probeFromResolved(resolved, libraryRoot);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
