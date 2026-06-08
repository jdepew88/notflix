import { NextRequest, NextResponse } from "next/server";
import {
  findLibraryEpisodes,
  groupLibraryEpisodesBySeason,
  mergeTmdbAndLibrarySeasons,
  type SeasonGroup,
} from "@/lib/episode-library";
import { readLibraryDatabase } from "@/lib/library-store";
import { getTmdbApiKey } from "@/lib/env";
import { getTvDetails, getTvSeasonEpisodes, posterUrl } from "@/lib/tmdb";
import { mergeSettingsForServerOps } from "@/lib/settings";

async function loadTmdbSeasons(
  apiKey: string,
  tmdbId: number,
  seasonNumbers: number[]
): Promise<SeasonGroup[]> {
  const groups: SeasonGroup[] = [];

  for (const season of seasonNumbers) {
    try {
      const data = await getTvSeasonEpisodes(apiKey, tmdbId, season);
      const episodes = data.episodes.map((ep) => ({
        season: ep.season_number,
        episode: ep.episode_number,
        title: ep.name || `Episode ${ep.episode_number}`,
        overview: ep.overview,
        stillPath: ep.still_path ? posterUrl(ep.still_path, "w500") : undefined,
        runtime: ep.runtime ?? undefined,
        airDate: ep.air_date,
        inLibrary: false,
      }));
      if (episodes.length > 0) {
        groups.push({ season, episodes });
      }
    } catch {
      /* skip missing seasons */
    }
  }

  return groups;
}

export async function GET(request: NextRequest) {
  const settings = mergeSettingsForServerOps(request);
  const params = request.nextUrl.searchParams;
  const tmdbIdParam = params.get("tmdbId");
  const tmdbId = tmdbIdParam ? parseInt(tmdbIdParam, 10) : undefined;
  const title = params.get("title") ?? undefined;
  const seriesId = params.get("seriesId") ?? undefined;

  const db = readLibraryDatabase();
  const libraryEpisodes = findLibraryEpisodes(db?.items ?? [], {
    tmdbId: Number.isFinite(tmdbId) ? tmdbId : undefined,
    title,
    id: seriesId,
  });
  const librarySeasons = groupLibraryEpisodesBySeason(libraryEpisodes);

  const apiKey = settings.tmdbApiKey || getTmdbApiKey();
  let tmdbSeasons: SeasonGroup[] = [];

  if (apiKey && tmdbId && Number.isFinite(tmdbId)) {
    try {
      const show = await getTvDetails(apiKey, tmdbId);
      const seasonNumbers = show.seasons
        .map((s) => s.season_number)
        .filter((n) => n > 0);

      const fromLibrary = new Set(librarySeasons.map((s) => s.season));
      const toFetch = [...new Set([...seasonNumbers, ...fromLibrary])].sort((a, b) => a - b);

      tmdbSeasons = await loadTmdbSeasons(apiKey, tmdbId, toFetch);
    } catch (err) {
      console.warn("[play/episodes] TMDB load failed:", err);
    }
  }

  const seasons =
    tmdbSeasons.length > 0
      ? mergeTmdbAndLibrarySeasons(tmdbSeasons, librarySeasons)
      : librarySeasons;

  if (seasons.length === 0) {
    return NextResponse.json({
      seasons: [],
      message: "No episodes found. Sync your library or add a TMDB API key for episode metadata.",
    });
  }

  return NextResponse.json({
    seasons,
    showTitle: title,
    tmdbId: Number.isFinite(tmdbId) ? tmdbId : undefined,
  });
}
