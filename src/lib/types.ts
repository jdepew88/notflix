export type MediaSource = "library" | "debrid" | "tmdb";

/** TMDB watch-provider API media type (`movie` or `tv`). */
export type TmdbMediaType = "movie" | "tv";

export interface WatchProvider {
  id: number;
  name: string;
  logoPath?: string;
}

export interface WatchProvidersByType {
  flatrate: WatchProvider[];
  rent: WatchProvider[];
  buy: WatchProvider[];
}

export interface MediaItem {
  id: string;
  title: string;
  overview?: string;
  posterPath?: string;
  backdropPath?: string;
  releaseDate?: string;
  runtime?: number;
  rating?: number;
  genres?: string[];
  genreIds?: number[];
  tmdbId?: number;
  /** TMDB media type for watch-provider lookups (`movie` or `tv`). */
  mediaType?: TmdbMediaType;
  watchProviders?: WatchProvidersByType;
  tvdbId?: number;
  plexRatingKey?: string;
  plexPartKey?: string;
  type: "movie" | "series" | "episode";
  source: MediaSource;
  streamUrl?: string;
  filePath?: string;
  season?: number;
  episode?: number;
  seriesId?: string;
  debridId?: string;
  progress?: number;
}

export interface ContentRow {
  id: string;
  title: string;
  items: MediaItem[];
}

export interface UserProfile {
  id: string;
  name: string;
  avatar: string;
  isKids?: boolean;
}

export interface DebridDownload {
  id: string;
  filename: string;
  host: string;
  split: number;
  progress: number;
  status: string;
  added: string;
  links: string[];
}

export interface LibraryConfig {
  nfsPath: string;
  plexToken?: string;
  plexUrl?: string;
}

export interface AppSettings {
  realDebridToken?: string;
  tmdbApiKey?: string;
  tvdbApiKey?: string;
  libraryPath?: string;
  plexUrl?: string;
  plexToken?: string;
  directPlay?: boolean;
  plexOnly?: boolean;
}
