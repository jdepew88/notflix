import { NextRequest, NextResponse } from "next/server";
import { mergeSettingsForServerOps } from "@/lib/settings";
import { readLibraryCache } from "@/lib/library-cache";
import { getHeroStatus, isHeroVideoReady, isHeroVideoGenerating } from "@/lib/hero-cache";
import { resolveHeroVideoWithSync } from "@/lib/hero-resolve";

export async function GET(request: NextRequest) {
  const settings = mergeSettingsForServerOps(request);
  const cache = readLibraryCache();
  if (!cache) {
    return NextResponse.json({ error: "Library cache not found" }, { status: 404 });
  }

  let status = getHeroStatus();

  const kickoff = request.nextUrl.searchParams.get("resolve") === "1";
  if (kickoff && !status?.videoReady && !isHeroVideoGenerating(status?.featuredId ?? "")) {
    status = await resolveHeroVideoWithSync(settings);
  }

  const featuredId = status?.featuredId ?? cache.featuredHeroId;
  const item = featuredId ? cache.items.find((i) => i.id === featuredId) ?? null : null;
  const videoReady = featuredId ? isHeroVideoReady(featuredId) : false;

  return NextResponse.json({
    featuredId,
    primaryId: status?.primaryFeaturedId ?? cache.heroPrimaryId ?? featuredId,
    videoReady,
    generating: isHeroVideoGenerating(featuredId ?? ""),
    exhausted: status?.exhausted ?? Boolean(cache.heroVideoError),
    error: cache.heroVideoError ?? (status?.exhausted ? status.lastError : null),
    attemptIndex: status?.attemptIndex ?? 0,
    candidateIds: status?.candidateIds ?? [],
    item,
    videoUrl: videoReady && featuredId
      ? `/api/hero/video?id=${encodeURIComponent(featuredId)}`
      : null,
  });
}
