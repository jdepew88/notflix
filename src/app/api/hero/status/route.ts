import { NextRequest, NextResponse } from "next/server";
import { mergeSettingsForServerOps } from "@/lib/settings";
import { readLibraryCache } from "@/lib/library-cache";
import { getHeroStatus, isHeroVideoReady, isHeroVideoGenerating } from "@/lib/hero-cache";
import { resolveHeroVideoWithSync } from "@/lib/hero-resolve";
import { isHeroVideoEnabled } from "@/lib/ffmpeg-config";

export async function GET(request: NextRequest) {
  const settings = mergeSettingsForServerOps(request);
  const cache = readLibraryCache();
  if (!cache) {
    return NextResponse.json({ error: "Library cache not found" }, { status: 404 });
  }

  const featuredId = cache.featuredHeroId;
  const item = featuredId ? cache.items.find((i) => i.id === featuredId) ?? null : null;

  if (!isHeroVideoEnabled()) {
    return NextResponse.json({
      featuredId,
      primaryId: cache.heroPrimaryId ?? featuredId,
      videoReady: false,
      generating: false,
      exhausted: false,
      error: null,
      attemptIndex: 0,
      candidateIds: [],
      item,
      videoUrl: null,
    });
  }

  let status = getHeroStatus();

  const kickoff = request.nextUrl.searchParams.get("resolve") === "1";
  if (kickoff && !status?.videoReady && !isHeroVideoGenerating(status?.featuredId ?? "")) {
    status = await resolveHeroVideoWithSync(settings);
  }

  const resolvedFeaturedId = status?.featuredId ?? cache.featuredHeroId;
  const resolvedItem = resolvedFeaturedId
    ? cache.items.find((i) => i.id === resolvedFeaturedId) ?? null
    : null;
  const videoReady = resolvedFeaturedId ? isHeroVideoReady(resolvedFeaturedId) : false;

  return NextResponse.json({
    featuredId: resolvedFeaturedId,
    primaryId: status?.primaryFeaturedId ?? cache.heroPrimaryId ?? resolvedFeaturedId,
    videoReady,
    generating: isHeroVideoGenerating(resolvedFeaturedId ?? ""),
    exhausted: status?.exhausted ?? Boolean(cache.heroVideoError),
    error: cache.heroVideoError ?? (status?.exhausted ? status.lastError : null),
    attemptIndex: status?.attemptIndex ?? 0,
    candidateIds: status?.candidateIds ?? [],
    item: resolvedItem,
    videoUrl: videoReady && resolvedFeaturedId
      ? `/api/hero/video?id=${encodeURIComponent(resolvedFeaturedId)}`
      : null,
  });
}
