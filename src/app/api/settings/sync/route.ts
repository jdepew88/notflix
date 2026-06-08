import { NextRequest, NextResponse } from "next/server";
import { testPlexConnection } from "@/lib/plex";
import { testTvdbConnection } from "@/lib/tvdb";
import {
  applySettingsCookies,
  mergeSettings,
  mergeSettingsForServerOps,
  mergeSettingsFromBody,
  saveServerSettings,
} from "@/lib/settings";
import { isPlexUrlPinnedFromEnv, withResolvedPlex } from "@/lib/plex-connection";
import { toClientSettings } from "@/lib/server-settings";
import { deleteLibraryCache } from "@/lib/library-cache";
import { startBackgroundLibrarySync } from "@/lib/library-sync";

export async function POST(request: NextRequest) {
  try {
    const previous = mergeSettings(request);
    const body = await request.json();
    const merged = mergeSettingsFromBody(request, {
      realDebridToken: body.realDebridToken,
      tmdbApiKey: body.tmdbApiKey,
      tvdbApiKey: body.tvdbApiKey,
      libraryPath: body.libraryPath,
      plexUrl: body.plexUrl,
      plexToken: body.plexToken,
      directPlay: body.directPlay,
      plexOnly: body.plexOnly,
    });

    const plexUrlChanged =
      previous.plexUrl.replace(/\/$/, "") !== merged.plexUrl.replace(/\/$/, "");
    const plexTokenChanged =
      typeof body.plexToken === "string" &&
      body.plexToken.length > 0 &&
      previous.plexToken !== merged.plexToken;
    const libraryPathChanged = previous.libraryPath !== merged.libraryPath;

    if (plexUrlChanged || libraryPathChanged) {
      deleteLibraryCache();
    }

    saveServerSettings(withResolvedPlex(merged));

    if (
      (plexTokenChanged || plexUrlChanged || libraryPathChanged) &&
      merged.plexUrl &&
      merged.plexToken
    ) {
      void startBackgroundLibrarySync(withResolvedPlex(merged), {
        forceRefresh: plexUrlChanged || libraryPathChanged,
      });
    }

    const resolved = withResolvedPlex(merged);
    const response = NextResponse.json({
      success: true,
      settings: toClientSettings(resolved),
    });
    applySettingsCookies(response, resolved);
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
    const serverSettings = mergeSettingsForServerOps(request);
    if (!serverSettings.plexUrl || !serverSettings.plexToken) {
      return NextResponse.json({ ok: false, error: "Plex URL and token required" }, { status: 400 });
    }
    const result = await testPlexConnection(
      serverSettings.plexUrl,
      serverSettings.plexToken
    );
    return NextResponse.json({
      ...result,
      plexUrl: serverSettings.plexUrl,
    });
  }

  if (test === "tvdb") {
    if (!settings.tvdbApiKey) {
      return NextResponse.json({ ok: false, error: "TVDB API key required" }, { status: 400 });
    }
    const result = await testTvdbConnection(settings.tvdbApiKey);
    return NextResponse.json(result);
  }

  if (config === "1") {
    const resolved = withResolvedPlex(mergeSettingsForServerOps(request));
    const response = NextResponse.json({
      settings: toClientSettings(resolved),
      plexUrlPinned: isPlexUrlPinnedFromEnv(),
      configured: {
        plex: !!(resolved.plexUrl && resolved.plexToken),
        nfs: !!resolved.libraryPath,
        tmdb: !!resolved.tmdbApiKey,
        tvdb: !!resolved.tvdbApiKey,
        debrid: !!resolved.realDebridToken,
      },
    });
    applySettingsCookies(response, resolved);
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
