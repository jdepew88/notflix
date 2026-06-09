import { NextRequest, NextResponse } from "next/server";
import { getPlexCredentials, plexDirectStreamUrl, plexHlsStreamUrl } from "@/lib/plex-stream";
import { getPlexItem } from "@/lib/plex";

async function findEpisodeRatingKey(
  baseUrl: string,
  token: string,
  showRatingKey: string,
  season: number,
  episode: number
): Promise<string | null> {
  const seasonsRes = await fetch(
    `${baseUrl}/library/metadata/${showRatingKey}/children?X-Plex-Token=${token}`,
    { headers: { Accept: "application/json" } }
  );
  if (!seasonsRes.ok) return null;

  const seasonsData = await seasonsRes.json();
  const seasonNode = (seasonsData.MediaContainer?.Metadata ?? []).find(
    (node: { parentIndex?: number; index?: number; ratingKey?: string }) =>
      node.parentIndex === season || node.index === season
  );
  if (!seasonNode?.ratingKey) return null;

  const episodesRes = await fetch(
    `${baseUrl}/library/metadata/${seasonNode.ratingKey}/children?X-Plex-Token=${token}`,
    { headers: { Accept: "application/json" } }
  );
  if (!episodesRes.ok) return null;

  const episodesData = await episodesRes.json();
  const episodeNode = (episodesData.MediaContainer?.Metadata ?? []).find(
    (node: { index?: number; ratingKey?: string }) => node.index === episode
  );
  return episodeNode?.ratingKey ?? null;
}

async function resolvePlayKey(
  baseUrl: string,
  token: string,
  ratingKey: string,
  season?: number,
  episode?: number
): Promise<string> {
  const item = await getPlexItem(baseUrl, token, ratingKey);
  if (item?.type !== "series") return ratingKey;

  if (season != null && episode != null) {
    const episodeKey = await findEpisodeRatingKey(baseUrl, token, ratingKey, season, episode);
    if (episodeKey) return episodeKey;
  }

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
    const playKey = await resolvePlayKey(
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
