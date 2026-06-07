import { NextRequest, NextResponse } from "next/server";
import { testPlexConnection } from "@/lib/plex";
import { testTvdbConnection } from "@/lib/tvdb";
import { mergeSettings } from "@/lib/settings";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const settings = mergeSettings(request);

    const plexUrl = body.plexUrl || settings.plexUrl;
    const plexToken = body.plexToken || settings.plexToken;
    const tvdbApiKey = body.tvdbApiKey || settings.tvdbApiKey;

    const response = NextResponse.json({ success: true });

    if (plexUrl) {
      response.cookies.set("plex_url", plexUrl, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
        httpOnly: true,
      });
    }
    if (plexToken) {
      response.cookies.set("plex_token", plexToken, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
        httpOnly: true,
      });
    }
    if (body.libraryPath) {
      response.cookies.set("library_path", body.libraryPath, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
        httpOnly: true,
      });
    }
    if (body.tmdbApiKey) {
      response.cookies.set("tmdb_key", body.tmdbApiKey, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
        httpOnly: true,
      });
    }
    if (tvdbApiKey) {
      response.cookies.set("tvdb_key", tvdbApiKey, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
        httpOnly: true,
      });
    }

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const settings = mergeSettings(request);
  const test = request.nextUrl.searchParams.get("test");

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

  return NextResponse.json({
    configured: {
      plex: !!(settings.plexUrl && settings.plexToken),
      nfs: !!settings.libraryPath,
      tmdb: !!settings.tmdbApiKey,
      tvdb: !!settings.tvdbApiKey,
    },
  });
}
