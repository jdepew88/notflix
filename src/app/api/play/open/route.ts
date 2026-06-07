import { NextRequest, NextResponse } from "next/server";
import { getRealDebridToken, getTmdbApiKey, getTorrentioUrl } from "@/lib/env";
import { openTorrentioStreamByIndex, parsePlayResolveParams } from "@/lib/play-resolve";
import { mergeSettings } from "@/lib/settings";

function buildPlayRequest(request: NextRequest) {
  const settings = mergeSettings(request);
  const params = request.nextUrl.searchParams;
  const parsed = parsePlayResolveParams(params);

  if (!parsed.tmdbId && !parsed.title) {
    return { error: NextResponse.json({ error: "tmdbId or title required" }, { status: 400 }) };
  }

  if (params.get("tmdbId") && !Number.isFinite(parsed.tmdbId)) {
    return { error: NextResponse.json({ error: "Invalid tmdbId" }, { status: 400 }) };
  }

  const streamIndexParam = params.get("streamIndex");
  const streamIndex = streamIndexParam ? parseInt(streamIndexParam, 10) : NaN;
  if (!Number.isFinite(streamIndex) || streamIndex < 0) {
    return { error: NextResponse.json({ error: "Invalid streamIndex" }, { status: 400 }) };
  }

  return {
    request: {
      ...parsed,
      plexUrl: settings.plexUrl,
      plexToken: settings.plexToken,
      torrentioUrl: settings.torrentioUrl || getTorrentioUrl() || undefined,
      realDebridToken: settings.realDebridToken || getRealDebridToken() || undefined,
      tmdbApiKey: settings.tmdbApiKey || getTmdbApiKey() || undefined,
      plexOnly: settings.plexOnly ?? true,
    },
    streamIndex,
  };
}

export async function GET(request: NextRequest) {
  const built = buildPlayRequest(request);
  if ("error" in built) return built.error;

  try {
    const result = await openTorrentioStreamByIndex(built.request, built.streamIndex);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to open stream";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
