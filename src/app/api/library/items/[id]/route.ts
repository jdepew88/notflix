import { NextRequest, NextResponse } from "next/server";
import { mergeSettingsForServerOps } from "@/lib/settings";
import {
  getLibraryItem,
  matchItemToTmdb,
  refreshItemArtwork,
  refreshItemFromPlex,
  resetItemMetadataOverride,
  searchMetadataMatches,
} from "@/lib/library-item-fix";
import type { TmdbMediaType } from "@/lib/types";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const itemId = decodeURIComponent(id);
  const settings = mergeSettingsForServerOps(request);
  const query = request.nextUrl.searchParams.get("q") ?? undefined;

  try {
    const item = getLibraryItem(itemId);
    if (!item) {
      return NextResponse.json({ error: "Title not found in library" }, { status: 404 });
    }

    const matches = await searchMetadataMatches(itemId, settings, query);
    return NextResponse.json({ item, matches });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const itemId = decodeURIComponent(id);
  const settings = mergeSettingsForServerOps(request);

  let body: {
    action?: string;
    tmdbId?: number;
    mediaType?: TmdbMediaType;
    query?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    switch (body.action) {
      case "refresh-artwork": {
        const item = await refreshItemArtwork(itemId, settings);
        return NextResponse.json({ ok: true, item });
      }
      case "match-tmdb": {
        if (!body.tmdbId || !body.mediaType) {
          return NextResponse.json(
            { error: "tmdbId and mediaType are required" },
            { status: 400 }
          );
        }
        const item = await matchItemToTmdb(itemId, settings, {
          tmdbId: body.tmdbId,
          mediaType: body.mediaType,
        });
        return NextResponse.json({ ok: true, item });
      }
      case "refresh-plex": {
        const item = await refreshItemFromPlex(itemId, settings);
        return NextResponse.json({ ok: true, item });
      }
      case "search": {
        const matches = await searchMetadataMatches(itemId, settings, body.query);
        return NextResponse.json({ ok: true, matches });
      }
      case "clear-override": {
        const item = resetItemMetadataOverride(itemId);
        return NextResponse.json({ ok: true, item });
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Action failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
