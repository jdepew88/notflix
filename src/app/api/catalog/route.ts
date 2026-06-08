import { NextRequest, NextResponse } from "next/server";
import {
  getTrending,
  getTrendingTv,
  getPopular,
  getPopularTv,
  getTopRated,
  getTopRatedTv,
  getNowPlaying,
  getOnTheAir,
  getAiringToday,
  searchMovies,
  getMovieDetails,
  getMovieVideos,
  getSimilarMovies,
  getTvDetails,
  getTvVideos,
  getSimilarTv,
  getGenres,
  getMoviesByGenre,
  enrichItemsWithWatchProviders,
} from "@/lib/tmdb";
import { getTmdbApiKey } from "@/lib/env";
import { mergeSettings } from "@/lib/settings";
import type { MediaItem } from "@/lib/types";

async function withWatchProviders(
  items: MediaItem[],
  apiKey: string,
  country: string
): Promise<MediaItem[]> {
  return enrichItemsWithWatchProviders(items, apiKey, country);
}

function resolveApiKey(request: NextRequest): string | undefined {
  const settings = mergeSettings(request);
  return settings.tmdbApiKey?.trim() || getTmdbApiKey() || undefined;
}

export async function GET(request: NextRequest) {
  const apiKey = resolveApiKey(request);
  if (!apiKey) {
    return NextResponse.json({ error: "TMDB API key not configured" }, { status: 503 });
  }

  const type = request.nextUrl.searchParams.get("type") ?? "trending";
  const query = request.nextUrl.searchParams.get("q");
  const id = request.nextUrl.searchParams.get("id");
  const genreId = request.nextUrl.searchParams.get("genreId");
  const page = parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10);
  const country = request.nextUrl.searchParams.get("country") ?? "US";

  try {
    if (type === "details" && id) {
      const movie = await getMovieDetails(apiKey, parseInt(id, 10));
      const item: MediaItem = {
        id: `tmdb-${movie.id}`,
        tmdbId: movie.id,
        mediaType: "movie",
        title: movie.title,
        overview: movie.overview,
        posterPath: movie.poster_path ?? undefined,
        backdropPath: movie.backdrop_path ?? undefined,
        releaseDate: movie.release_date,
        rating: movie.vote_average,
        runtime: movie.runtime,
        genres: movie.genres.map((g) => g.name),
        genreIds: movie.genres.map((g) => g.id),
        type: "movie",
        source: "tmdb",
      };
      const [enriched] = await withWatchProviders([item], apiKey, country);
      return NextResponse.json({ item: enriched });
    }

    if (type === "tv_details" && id) {
      const show = await getTvDetails(apiKey, parseInt(id, 10));
      const item: MediaItem = {
        id: `tmdb-tv-${show.id}`,
        tmdbId: show.id,
        mediaType: "tv",
        title: show.name,
        overview: show.overview,
        posterPath: show.poster_path ?? undefined,
        backdropPath: show.backdrop_path ?? undefined,
        releaseDate: show.first_air_date,
        rating: show.vote_average,
        genres: show.genres.map((g) => g.name),
        genreIds: show.genres.map((g) => g.id),
        type: "series",
        source: "tmdb",
      };
      const [enriched] = await withWatchProviders([item], apiKey, country);
      return NextResponse.json({ item: enriched });
    }

    if (type === "videos" && id) {
      const key = await getMovieVideos(apiKey, parseInt(id, 10));
      return NextResponse.json({ key });
    }

    if (type === "tv_videos" && id) {
      const key = await getTvVideos(apiKey, parseInt(id, 10));
      return NextResponse.json({ key });
    }

    if (type === "similar" && id) {
      const items = await getSimilarMovies(apiKey, parseInt(id, 10));
      return NextResponse.json({
        items: await withWatchProviders(items, apiKey, country),
      });
    }

    if (type === "tv_similar" && id) {
      const items = await getSimilarTv(apiKey, parseInt(id, 10));
      return NextResponse.json({
        items: await withWatchProviders(items, apiKey, country),
      });
    }

    if (type === "genres") {
      const genres = await getGenres(apiKey);
      return NextResponse.json({ genres });
    }

    if (type === "genre" && genreId) {
      const result = await getMoviesByGenre(apiKey, parseInt(genreId, 10), page);
      return NextResponse.json({
        items: await withWatchProviders(result.items, apiKey, country),
        totalPages: result.totalPages,
      });
    }

    let items: MediaItem[];
    switch (type) {
      case "popular":
        items = await getPopular(apiKey, page);
        break;
      case "popular_tv":
        items = await getPopularTv(apiKey, page);
        break;
      case "top_rated":
        items = await getTopRated(apiKey, page);
        break;
      case "top_rated_tv":
        items = await getTopRatedTv(apiKey, page);
        break;
      case "now_playing":
        items = await getNowPlaying(apiKey, page);
        break;
      case "trending_tv":
        items = await getTrendingTv(apiKey, page);
        break;
      case "on_the_air":
        items = await getOnTheAir(apiKey, page);
        break;
      case "airing_today":
        items = await getAiringToday(apiKey, page);
        break;
      case "search":
        if (!query) return NextResponse.json({ items: [] });
        items = await searchMovies(apiKey, query);
        break;
      default:
        items = await getTrending(apiKey, page);
    }
    return NextResponse.json({
      items: await withWatchProviders(items, apiKey, country),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "TMDB error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
