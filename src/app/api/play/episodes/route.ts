import { NextRequest, NextResponse } from "next/server";
import {
  findLibraryEpisodes,
  groupLibraryEpisodesBySeason,
  groupTvdbEpisodesBySeason,
  mergeFillGapSeasons,
  mergeTmdbAndLibrarySeasons,
  type SeasonGroup,
} from "@/lib/episode-library";
import { readLibraryDatabase } from "@/lib/library-store";
import { getTmdbApiKey } from "@/lib/env";
import { getTvDetails, getTvSeasonEpisodes, posterUrl } from "@/lib/tmdb";
import { mergeSettingsForServerOps } from "@/lib/settings";
import {
  getTvdbSeries,
  getTvdbSeriesEpisodes,
  parseTmdbIdFromTvdbRemoteIds,
} from "@/lib/tvdb";

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

async function loadTvdbSeasons(
  apiKey: string,
  tvdbId: number
): Promise<SeasonGroup[]> {
  const episodes = await getTvdbSeriesEpisodes(apiKey, tvdbId);
  return groupTvdbEpisodesBySeason(episodes);
}

export async function GET(request: NextRequest) {
  const settings = mergeSettingsForServerOps(request);
  const params = request.nextUrl.searchParams;
  const tmdbIdParam = params.get("tmdbId");
  const tmdbId = tmdbIdParam ? parseInt(tmdbIdParam, 10) : undefined;
  const tvdbIdParam = params.get("tvdbId");
  const tvdbId = tvdbIdParam ? parseInt(tvdbIdParam, 10) : undefined;
  const title = params.get("title") ?? undefined;
  const seriesId = params.get("seriesId") ?? undefined;

  const db = readLibraryDatabase();
  const libraryItems = db?.items ?? [];

  const show =
    seriesId != null
      ? libraryItems.find((i) => i.id === seriesId && i.type === "series")
      : undefined;

  let resolvedTmdbId = Number.isFinite(tmdbId) ? tmdbId : show?.tmdbId;
  let resolvedTvdbId = Number.isFinite(tvdbId) ? tvdbId : show?.tvdbId;

  if (!resolvedTvdbId && seriesId) {
    const fromEpisode = libraryItems.find(
      (i) => i.type === "episode" && i.seriesId === seriesId && i.tvdbId
    );
    if (fromEpisode?.tvdbId) resolvedTvdbId = fromEpisode.tvdbId;
  }

  if (
    settings.tvdbApiKey &&
    resolvedTvdbId &&
    Number.isFinite(resolvedTvdbId) &&
    !resolvedTmdbId
  ) {
    try {
      const tvdbShow = await getTvdbSeries(settings.tvdbApiKey, resolvedTvdbId);
      resolvedTmdbId = parseTmdbIdFromTvdbRemoteIds(tvdbShow.data.remoteIds);
    } catch (err) {
      console.warn("[play/episodes] TVDB series lookup failed:", err);
    }
  }

  const libraryEpisodes = findLibraryEpisodes(libraryItems, {
    tmdbId: resolvedTmdbId,
    title,
    id: seriesId,
  });
  const librarySeasons = groupLibraryEpisodesBySeason(libraryEpisodes);

  const tmdbApiKey = settings.tmdbApiKey || getTmdbApiKey();
  let tmdbSeasons: SeasonGroup[] = [];
  let tvdbSeasons: SeasonGroup[] = [];

  if (tmdbApiKey && resolvedTmdbId && Number.isFinite(resolvedTmdbId)) {
    try {
      const tvShow = await getTvDetails(tmdbApiKey, resolvedTmdbId);
      const seasonNumbers = tvShow.seasons
        .map((s) => s.season_number)
        .filter((n) => n > 0);

      const fromLibrary = new Set(librarySeasons.map((s) => s.season));
      const toFetch = [...new Set([...seasonNumbers, ...fromLibrary])].sort((a, b) => a - b);

      tmdbSeasons = await loadTmdbSeasons(tmdbApiKey, resolvedTmdbId, toFetch);
    } catch (err) {
      console.warn("[play/episodes] TMDB load failed:", err);
    }
  }

  if (
    settings.tvdbApiKey &&
    resolvedTvdbId &&
    Number.isFinite(resolvedTvdbId)
  ) {
    try {
      tvdbSeasons = await loadTvdbSeasons(settings.tvdbApiKey, resolvedTvdbId);
    } catch (err) {
      console.warn("[play/episodes] TVDB episodes load failed:", err);
    }
  }

  let metaSeasons = tmdbSeasons;
  if (metaSeasons.length === 0) {
    metaSeasons = tvdbSeasons;
  } else if (tvdbSeasons.length > 0) {
    metaSeasons = mergeFillGapSeasons(metaSeasons, tvdbSeasons);
  }

  const seasons =
    metaSeasons.length > 0
      ? mergeTmdbAndLibrarySeasons(metaSeasons, librarySeasons)
      : librarySeasons;

  if (seasons.length === 0) {
    const hints: string[] = [];
    if (libraryEpisodes.length === 0) {
      hints.push(
        "Go to Settings → Save & Sync Library (or Full resync) so Plex TV episodes are imported."
      );
    }
    if (!tmdbApiKey && !settings.tvdbApiKey) {
      hints.push("Add TMDB and/or TVDB API keys in Settings for episode synopses and artwork.");
    } else if (!resolvedTmdbId && !resolvedTvdbId) {
      hints.push(
        "This show has no TMDB/TVDB id in Plex — refresh Plex metadata or rematch the show in Plex."
      );
    }
    return NextResponse.json({
      seasons: [],
      libraryEpisodeCount: libraryEpisodes.length,
      message:
        hints.join(" ") ||
        "No episodes found. Sync your library or add metadata API keys for episode lists.",
    });
  }

  return NextResponse.json({
    seasons,
    showTitle: title,
    tmdbId: resolvedTmdbId,
    tvdbId: resolvedTvdbId,
    libraryEpisodeCount: libraryEpisodes.length,
  });
}
