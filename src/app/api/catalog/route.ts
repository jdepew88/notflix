import { NextRequest, NextResponse } from "next/server";
import {
  getTrending,
  getPopular,
  getTopRated,
  getNowPlaying,
  searchMovies,
  getMovieDetails,
  getMovieVideos,
  getSimilarMovies,
  getGenres,
  getMoviesByGenre,
} from "@/lib/tmdb";
import { getTmdbApiKey } from "@/lib/env";
import type { MediaItem } from "@/lib/types";

export async function GET(request: NextRequest) {
  const apiKey = getTmdbApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: "TMDB_API_KEY not configured" }, { status: 503 });
  }

  const type = request.nextUrl.searchParams.get("type") ?? "trending";
  const query = request.nextUrl.searchParams.get("q");
  const id = request.nextUrl.searchParams.get("id");
  const genreId = request.nextUrl.searchParams.get("genreId");
  const page = parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10);

  try {
    if (type === "details" && id) {
      const movie = await getMovieDetails(apiKey, parseInt(id, 10));
      const item: MediaItem = {
        id: `tmdb-${movie.id}`,
        tmdbId: movie.id,
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
      return NextResponse.json({ item });
    }

    if (type === "videos" && id) {
      const key = await getMovieVideos(apiKey, parseInt(id, 10));
      return NextResponse.json({ key });
    }

    if (type === "similar" && id) {
      const items = await getSimilarMovies(apiKey, parseInt(id, 10));
      return NextResponse.json({ items });
    }

    if (type === "genres") {
      const genres = await getGenres(apiKey);
      return NextResponse.json({ genres });
    }

    if (type === "genre" && genreId) {
      const result = await getMoviesByGenre(apiKey, parseInt(genreId, 10), page);
      return NextResponse.json(result);
    }

    let items;
    switch (type) {
      case "popular":
        items = await getPopular(apiKey);
        break;
      case "top_rated":
        items = await getTopRated(apiKey);
        break;
      case "now_playing":
        items = await getNowPlaying(apiKey);
        break;
      case "search":
        if (!query) return NextResponse.json({ items: [] });
        items = await searchMovies(apiKey, query);
        break;
      default:
        items = await getTrending(apiKey);
    }
    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "TMDB error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
