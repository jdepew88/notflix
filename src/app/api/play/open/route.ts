import { NextRequest, NextResponse } from "next/server";
import { getPeerflixUrl, getRealDebridToken, getTmdbApiKey, getTorrentioUrl } from "@/lib/env";
import { openTorrentioStreamByIndex, parsePlayResolveParams } from "@/lib/play-resolve";
import { mergeSettingsForServerOps } from "@/lib/settings";

function buildPlayRequest(request: NextRequest) {
  const settings = mergeSettingsForServerOps(request);
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

  const debridOnly = params.get("debridOnly") === "1";
  const directPlayPreferred =
    params.get("directPlay") === "1" ||
    params.get("directPlayPreferred") === "1" ||
    debridOnly;

  return {
    request: {
      ...parsed,
      plexUrl: settings.plexUrl,
      plexToken: settings.plexToken,
      torrentioUrl: settings.torrentioUrl || getTorrentioUrl() || undefined,
      peerflixUrl: settings.peerflixUrl || getPeerflixUrl() || undefined,
      realDebridToken: settings.realDebridToken || getRealDebridToken() || undefined,
      tmdbApiKey: settings.tmdbApiKey || getTmdbApiKey() || undefined,
      plexOnly: settings.plexOnly ?? false,
      debridOnly,
      directPlayPreferred,
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
