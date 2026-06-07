import { NextRequest, NextResponse } from "next/server";
import { testPlexConnection } from "@/lib/plex";
import { testTvdbConnection } from "@/lib/tvdb";
import {
  applySettingsCookies,
  mergeSettings,
  mergeSettingsFromBody,
  saveServerSettings,
} from "@/lib/settings";
import { toClientSettings } from "@/lib/server-settings";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const merged = mergeSettingsFromBody(request, {
      realDebridToken: body.realDebridToken,
      tmdbApiKey: body.tmdbApiKey,
      tvdbApiKey: body.tvdbApiKey,
      libraryPath: body.libraryPath,
      plexUrl: body.plexUrl,
      plexToken: body.plexToken,
      directPlay: body.directPlay,
    });

    saveServerSettings(merged);

    const response = NextResponse.json({
      success: true,
      settings: toClientSettings(merged),
    });
    applySettingsCookies(response, merged);
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const settings = mergeSettings(request);
  const test = request.nextUrl.searchParams.get("test");
  const config = request.nextUrl.searchParams.get("config");

  if (test === "plex") {
    if (!settings.plexUrl || !settings.plexToken) {
      return NextResponse.json({ ok: false, error: "Plex URL and token required" }, { status: 400 });
    }
    const result = await testPlexConnection(settings.plexUrl, settings.plexToken);
    return NextResponse.json(result);
  }

  if (test === "tvdb") {
    if (!settings.tvdbApiKey) {
      return NextResponse.json({ ok: false, error: "TVDB API key required" }, { status: 400 });
    }
    const result = await testTvdbConnection(settings.tvdbApiKey);
    return NextResponse.json(result);
  }

  if (config === "1") {
    const response = NextResponse.json({
      settings: toClientSettings(settings),
      configured: {
        plex: !!(settings.plexUrl && settings.plexToken),
        nfs: !!settings.libraryPath,
        tmdb: !!settings.tmdbApiKey,
        tvdb: !!settings.tvdbApiKey,
        debrid: !!settings.realDebridToken,
      },
    });
    applySettingsCookies(response, settings);
    return response;
  }

  return NextResponse.json({
    configured: {
      plex: !!(settings.plexUrl && settings.plexToken),
      nfs: !!settings.libraryPath,
      tmdb: !!settings.tmdbApiKey,
      tvdb: !!settings.tvdbApiKey,
      debrid: !!settings.realDebridToken,
    },
  });
}
