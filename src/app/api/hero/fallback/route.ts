import { resolveHeroVideoWithSync } from "@/lib/hero-resolve";
import { readLibraryCache } from "@/lib/library-cache";
import { isHeroVideoReady } from "@/lib/hero-cache";
import { mergeSettingsForServerOps } from "@/lib/settings";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const settings = mergeSettingsForServerOps(request);
    const cache = readLibraryCache();
    if (!cache) {
      return NextResponse.json({ error: "Library cache not found" }, { status: 404 });
    }

    let body: { id?: string; reason?: string } = {};
    try {
      body = await request.json();
    } catch {
      /* optional body */
    }

    const status = await resolveHeroVideoWithSync(settings, {
      markFailedId: body.id,
      reason: body.reason ?? "Playback failed in browser",
    });

    if (!status) {
      return NextResponse.json({ error: "Could not resolve hero video" }, { status: 500 });
    }

    const item = cache.items.find((i) => i.id === status.featuredId) ?? null;

    return NextResponse.json({
      featuredId: status.featuredId,
      primaryId: status.primaryFeaturedId,
      videoReady: status.videoReady && isHeroVideoReady(status.featuredId),
      exhausted: status.exhausted,
      error: status.exhausted ? status.lastError : null,
      item,
      videoUrl:
        status.videoReady && isHeroVideoReady(status.featuredId)
          ? `/api/hero/video?id=${encodeURIComponent(status.featuredId)}`
          : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Hero fallback failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
