import { NextRequest, NextResponse } from "next/server";
import { getRealDebridToken, getTmdbApiKey, getTorrentioUrl } from "@/lib/env";
import { resolvePlayback } from "@/lib/play-resolve";
import { mergeSettings } from "@/lib/settings";

export async function GET(request: NextRequest) {
  const settings = mergeSettings(request);
  const params = request.nextUrl.searchParams;

  const tmdbIdParam = params.get("tmdbId");
  const type = (params.get("type") ?? "movie") as "movie" | "series";
  const season = params.get("season") ? parseInt(params.get("season")!, 10) : undefined;
  const episode = params.get("episode") ? parseInt(params.get("episode")!, 10) : undefined;
  const title = params.get("title") ?? undefined;
  const year = params.get("year") ? parseInt(params.get("year")!, 10) : undefined;

  if (!tmdbIdParam && !title) {
    return NextResponse.json(
      { error: "tmdbId or title required" },
      { status: 400 }
    );
  }

  const tmdbId = tmdbIdParam ? parseInt(tmdbIdParam, 10) : undefined;
  if (tmdbIdParam && !Number.isFinite(tmdbId)) {
    return NextResponse.json({ error: "Invalid tmdbId" }, { status: 400 });
  }

  const result = await resolvePlayback({
    tmdbId,
    type,
    season,
    episode,
    title,
    year,
    plexUrl: settings.plexUrl,
    plexToken: settings.plexToken,
    torrentioUrl: getTorrentioUrl() || undefined,
    realDebridToken: settings.realDebridToken || getRealDebridToken() || undefined,
    tmdbApiKey: settings.tmdbApiKey || getTmdbApiKey() || undefined,
  });

  if (result.source === "none") {
    return NextResponse.json(result, { status: 404 });
  }

  return NextResponse.json(result);
}
