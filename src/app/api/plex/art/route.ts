import { NextRequest, NextResponse } from "next/server";
import { mergeSettings } from "@/lib/settings";

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path");
  const plexUrl =
    request.nextUrl.searchParams.get("plexUrl") ||
    mergeSettings(request).plexUrl;
  const token =
    request.nextUrl.searchParams.get("token") ||
    mergeSettings(request).plexToken;

  if (!path || !plexUrl || !token) {
    return NextResponse.json({ error: "Missing Plex art parameters" }, { status: 400 });
  }

  const base = plexUrl.replace(/\/$/, "");
  const upstreamUrl = `${base}${path}?X-Plex-Token=${token}`;

  try {
    const upstream = await fetch(upstreamUrl);
    if (!upstream.ok) {
      return NextResponse.json({ error: "Art not found" }, { status: upstream.status });
    }

    const responseHeaders = new Headers();
    responseHeaders.set(
      "Content-Type",
      upstream.headers.get("Content-Type") || "image/jpeg"
    );
    responseHeaders.set("Cache-Control", "public, max-age=86400");

    return new NextResponse(upstream.body, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Plex art failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
