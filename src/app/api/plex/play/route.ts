import { NextRequest, NextResponse } from "next/server";
import { getPlexCredentials, plexDirectStreamUrl, plexHlsStreamUrl } from "@/lib/plex-stream";
import { getPlexItem } from "@/lib/plex";

async function resolvePlayKey(
  baseUrl: string,
  token: string,
  ratingKey: string
): Promise<string> {
  const item = await getPlexItem(baseUrl, token, ratingKey);
  if (item?.type !== "series") return ratingKey;

  const res = await fetch(
    `${baseUrl}/library/metadata/${ratingKey}/children?X-Plex-Token=${token}`,
    { headers: { Accept: "application/json" } }
  );
  if (!res.ok) return ratingKey;

  const data = await res.json();
  const firstSeason = data.MediaContainer?.Metadata?.[0];
  if (!firstSeason?.ratingKey) return ratingKey;

  const epRes = await fetch(
    `${baseUrl}/library/metadata/${firstSeason.ratingKey}/children?X-Plex-Token=${token}`,
    { headers: { Accept: "application/json" } }
  );
  if (!epRes.ok) return ratingKey;

  const epData = await epRes.json();
  return epData.MediaContainer?.Metadata?.[0]?.ratingKey ?? ratingKey;
}

export async function GET(request: NextRequest) {
  const ratingKey = request.nextUrl.searchParams.get("ratingKey");
  const mode = request.nextUrl.searchParams.get("mode") ?? "direct";
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
    const playKey = await resolvePlayKey(baseUrl, token, ratingKey);
    const item = await getPlexItem(baseUrl, token, playKey);

    if (mode === "transcode") {
      return NextResponse.json({
        streamUrl: plexHlsStreamUrl(playKey, baseUrl),
        mode: "hls",
        ratingKey: playKey,
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
