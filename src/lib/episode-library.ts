import type { MediaItem } from "./types";
import { normalizeTitle } from "./plex-match";
import type { TvdbEpisodeRecord } from "./tvdb";

export interface EpisodeListEntry {
  season: number;
  episode: number;
  title: string;
  overview?: string;
  stillPath?: string;
  runtime?: number;
  airDate?: string;
  watchId?: string;
  libraryItem?: MediaItem;
  inLibrary: boolean;
}

export interface SeasonGroup {
  season: number;
  episodes: EpisodeListEntry[];
}

function sameShow(item: MediaItem, show: { tmdbId?: number; title?: string; id?: string }): boolean {
  if (show.id && (item.seriesId === show.id || item.id === show.id)) return true;
  if (show.tmdbId && item.tmdbId === show.tmdbId) return true;
  if (show.title && normalizeTitle(item.title) === normalizeTitle(show.title)) return true;
  return false;
}

export function findLibraryEpisodes(
  items: MediaItem[],
  show: { tmdbId?: number; title?: string; id?: string }
): MediaItem[] {
  return items.filter((item) => {
    if (item.type !== "episode") return false;
    if (item.season == null || item.episode == null) return false;
    return sameShow(item, show);
  });
}

export function groupLibraryEpisodesBySeason(episodes: MediaItem[]): SeasonGroup[] {
  const map = new Map<number, EpisodeListEntry[]>();

  for (const item of episodes) {
    if (item.season == null || item.episode == null) continue;
    const entry: EpisodeListEntry = {
      season: item.season,
      episode: item.episode,
      title: item.episodeTitle || `Episode ${item.episode}`,
      overview: item.overview,
      stillPath: item.posterPath,
      runtime: item.runtime,
      airDate: item.releaseDate,
      watchId: item.id,
      libraryItem: item,
      inLibrary: true,
    };
    const list = map.get(item.season) ?? [];
    list.push(entry);
    map.set(item.season, list);
  }

  return [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([season, eps]) => ({
      season,
      episodes: eps.sort((a, b) => a.episode - b.episode),
    }));
}

export function groupTvdbEpisodesBySeason(episodes: TvdbEpisodeRecord[]): SeasonGroup[] {
  const map = new Map<number, EpisodeListEntry[]>();

  for (const ep of episodes) {
    if (ep.seasonNumber < 1) continue;
    const entry: EpisodeListEntry = {
      season: ep.seasonNumber,
      episode: ep.number,
      title: ep.name || `Episode ${ep.number}`,
      overview: ep.overview,
      stillPath: ep.image,
      runtime: ep.runtime,
      airDate: ep.aired,
      inLibrary: false,
    };
    const list = map.get(ep.seasonNumber) ?? [];
    list.push(entry);
    map.set(ep.seasonNumber, list);
  }

  return [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([season, eps]) => ({
      season,
      episodes: eps.sort((a, b) => a.episode - b.episode),
    }));
}

/** Adds episodes from `fill` only where `primary` has no entry for that season/episode. */
export function mergeFillGapSeasons(
  primary: SeasonGroup[],
  fill: SeasonGroup[]
): SeasonGroup[] {
  const map = new Map<number, Map<number, EpisodeListEntry>>();

  for (const group of primary) {
    const epMap = map.get(group.season) ?? new Map();
    for (const ep of group.episodes) {
      epMap.set(ep.episode, ep);
    }
    map.set(group.season, epMap);
  }

  for (const group of fill) {
    const epMap = map.get(group.season) ?? new Map();
    for (const ep of group.episodes) {
      if (!epMap.has(ep.episode)) {
        epMap.set(ep.episode, ep);
      }
    }
    map.set(group.season, epMap);
  }

  return [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([season, epMap]) => ({
      season,
      episodes: [...epMap.values()].sort((a, b) => a.episode - b.episode),
    }));
}

export function mergeTmdbAndLibrarySeasons(
  tmdbSeasons: SeasonGroup[],
  librarySeasons: SeasonGroup[]
): SeasonGroup[] {
  const map = new Map<number, Map<number, EpisodeListEntry>>();

  for (const group of tmdbSeasons) {
    const epMap = map.get(group.season) ?? new Map();
    for (const ep of group.episodes) {
      epMap.set(ep.episode, ep);
    }
    map.set(group.season, epMap);
  }

  for (const group of librarySeasons) {
    const epMap = map.get(group.season) ?? new Map();
    for (const ep of group.episodes) {
      const existing = epMap.get(ep.episode);
      if (existing) {
        epMap.set(ep.episode, {
          ...existing,
          ...ep,
          inLibrary: true,
          libraryItem: ep.libraryItem,
          watchId: ep.watchId ?? existing.watchId,
        });
      } else {
        epMap.set(ep.episode, ep);
      }
    }
    map.set(group.season, epMap);
  }

  return [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([season, epMap]) => ({
      season,
      episodes: [...epMap.values()].sort((a, b) => a.episode - b.episode),
    }));
}

export function findLibraryEpisode(
  items: MediaItem[],
  query: {
    tmdbId?: number;
    title?: string;
    seriesId?: string;
    season: number;
    episode: number;
  }
): MediaItem | null {
  return (
    findLibraryEpisodes(items, {
      tmdbId: query.tmdbId,
      title: query.title,
      id: query.seriesId,
    }).find((item) => item.season === query.season && item.episode === query.episode) ??
    null
  );
}
