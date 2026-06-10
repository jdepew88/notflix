import { NextRequest, NextResponse } from "next/server";
import { getPeerflixUrl, getRealDebridToken, getTmdbApiKey, getTorrentioUrl } from "@/lib/env";
import { resolveDownloadPlayback } from "@/lib/download-playback";
import { parsePlayResolveParams } from "@/lib/play-resolve";
import { mergeSettingsForServerOps } from "@/lib/settings";

function buildPlayRequest(request: NextRequest) {
  const settings = mergeSettingsForServerOps(request);
  const params = request.nextUrl.searchParams;
  const parsed = parsePlayResolveParams(params);
  const itemId = params.get("itemId") ?? undefined;

  if (!itemId && !parsed.tmdbId && !parsed.title) {
    return { error: NextResponse.json({ error: "itemId, tmdbId, or title required" }, { status: 400 }) };
  }

  if (params.get("tmdbId") && !Number.isFinite(parsed.tmdbId)) {
    return { error: NextResponse.json({ error: "Invalid tmdbId" }, { status: 400 }) };
  }

  const streamIndexParam = params.get("streamIndex");
  const streamIndex =
    streamIndexParam === null || streamIndexParam === ""
      ? undefined
      : parseInt(streamIndexParam, 10);

  if (streamIndexParam != null && streamIndexParam !== "" && !Number.isFinite(streamIndex)) {
    return { error: NextResponse.json({ error: "Invalid streamIndex" }, { status: 400 }) };
  }

  return {
    itemId,
    streamIndex,
    request: {
      ...parsed,
      plexUrl: settings.plexUrl,
      plexToken: settings.plexToken,
      torrentioUrl: settings.torrentioUrl || getTorrentioUrl() || undefined,
      peerflixUrl: settings.peerflixUrl || getPeerflixUrl() || undefined,
      realDebridToken: settings.realDebridToken || getRealDebridToken() || undefined,
      tmdbApiKey: settings.tmdbApiKey || getTmdbApiKey() || undefined,
      plexOnly: settings.plexOnly ?? false,
    },
  };
}

export async function GET(request: NextRequest) {
  const built = buildPlayRequest(request);
  if ("error" in built) return built.error;

  try {
    const result = await resolveDownloadPlayback(
      built.request,
      built.itemId,
      built.streamIndex
    );
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Download failed";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
