import { NextResponse } from "next/server";
import { resolveLibraryPath } from "@/lib/library-path";

/** Lightweight liveness check — does not touch Plex, library sync, or auth. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    libraryPath: resolveLibraryPath(process.env.LIBRARY_PATH) || null,
  });
}
