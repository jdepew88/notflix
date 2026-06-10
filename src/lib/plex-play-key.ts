import { getPlexItem } from "./plex";

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

/** Resolve a show or movie rating key to the playable episode/movie key. */
export async function resolvePlexPlayRatingKey(
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
