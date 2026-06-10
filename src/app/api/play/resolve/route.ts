import { NextRequest, NextResponse } from "next/server";
import { getPeerflixUrl, getRealDebridToken, getTmdbApiKey, getTorrentioUrl } from "@/lib/env";
import { resolvePlayback, parsePlayResolveParams } from "@/lib/play-resolve";
import { mergeSettingsForServerOps } from "@/lib/settings";

export async function GET(request: NextRequest) {
  const settings = mergeSettingsForServerOps(request);
  const params = request.nextUrl.searchParams;
  const parsed = parsePlayResolveParams(params);

  if (!parsed.tmdbId && !parsed.title) {
    return NextResponse.json({ error: "tmdbId or title required" }, { status: 400 });
  }

  if (params.get("tmdbId") && !Number.isFinite(parsed.tmdbId)) {
    return NextResponse.json({ error: "Invalid tmdbId" }, { status: 400 });
  }

  const result = await resolvePlayback({
    ...parsed,
    plexUrl: settings.plexUrl,
    plexToken: settings.plexToken,
    libraryPath: settings.libraryPath,
    torrentioUrl: settings.torrentioUrl || getTorrentioUrl() || undefined,
    peerflixUrl: settings.peerflixUrl || getPeerflixUrl() || undefined,
    realDebridToken: settings.realDebridToken || getRealDebridToken() || undefined,
    tmdbApiKey: settings.tmdbApiKey || getTmdbApiKey() || undefined,
    plexOnly: settings.plexOnly ?? false,
  });

  if (result.source === "none") {
    return NextResponse.json(result, { status: 404 });
  }

  return NextResponse.json(result);
}
