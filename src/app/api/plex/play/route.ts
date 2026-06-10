import { NextRequest, NextResponse } from "next/server";
import { getPlexCredentials, plexDirectStreamUrl, plexHlsStreamUrl } from "@/lib/plex-stream";
import { getPlexItem } from "@/lib/plex";
import { resolvePlexPlayRatingKey } from "@/lib/plex-play-key";

export async function GET(request: NextRequest) {
  const ratingKey = request.nextUrl.searchParams.get("ratingKey");
  const mode = request.nextUrl.searchParams.get("mode") ?? "direct";
  const seasonParam = request.nextUrl.searchParams.get("season");
  const episodeParam = request.nextUrl.searchParams.get("episode");
  const season = seasonParam ? parseInt(seasonParam, 10) : undefined;
  const episode = episodeParam ? parseInt(episodeParam, 10) : undefined;
  const { plexUrl, token } = getPlexCredentials(request);
  const plexUrlParam = request.nextUrl.searchParams.get("plexUrl");
  const baseUrl = (plexUrlParam || plexUrl).replace(/\/$/, "");

  if (!ratingKey || !baseUrl || !token) {
    return NextResponse.json(
      {
        error: "Missing Plex play parameters",
        hint: "Open Settings, enter Plex URL + token, then click Save & Sync Library.",
        missing: {
          ratingKey: !ratingKey,
          plexUrl: !baseUrl,
          token: !token,
        },
      },
      { status: 400 }
    );
  }

  try {
    const playKey = await resolvePlexPlayRatingKey(
      baseUrl,
      token,
      ratingKey,
      Number.isFinite(season) ? season : undefined,
      Number.isFinite(episode) ? episode : undefined
    );
    const item = await getPlexItem(baseUrl, token, playKey);

    if (mode === "transcode") {
      return NextResponse.json({
        streamUrl: plexHlsStreamUrl(playKey, baseUrl),
        mode: "hls",
        ratingKey: playKey,
        partKey: item?.plexPartKey,
      });
    }

    if (!item?.plexPartKey) {
      return NextResponse.json(
        { error: "No direct stream available for this item" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      streamUrl: plexDirectStreamUrl(item.plexPartKey, baseUrl),
      mode: "direct",
      ratingKey: playKey,
      partKey: item.plexPartKey,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Play resolve failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
