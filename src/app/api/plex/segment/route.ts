import { NextRequest, NextResponse } from "next/server";
import { getPlexCredentials, PLEX_CLIENT_ID, PLEX_PLATFORM, PLEX_PRODUCT } from "@/lib/plex-stream";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  const { token } = getPlexCredentials(request);

  if (!url || !token) {
    return NextResponse.json({ error: "Missing segment url or Plex token" }, { status: 400 });
  }

  const range = request.headers.get("range");
  const headers: HeadersInit = {
    Accept: "*/*",
    "X-Plex-Token": token,
    "X-Plex-Client-Identifier": PLEX_CLIENT_ID,
    "X-Plex-Platform": PLEX_PLATFORM,
    "X-Plex-Product": PLEX_PRODUCT,
  };
  if (range) headers["Range"] = range;

  try {
    const upstream = await fetch(url, { headers });
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Segment fetch failed: ${upstream.status}` },
        { status: upstream.status }
      );
    }

    const responseHeaders = new Headers();
    responseHeaders.set(
      "Content-Type",
      upstream.headers.get("Content-Type") || "video/mp2t"
    );
    responseHeaders.set("Accept-Ranges", "bytes");
    responseHeaders.set("Cache-Control", "no-cache");
    const contentLength = upstream.headers.get("Content-Length");
    const contentRange = upstream.headers.get("Content-Range");
    if (contentLength) responseHeaders.set("Content-Length", contentLength);
    if (contentRange) responseHeaders.set("Content-Range", contentRange);

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Segment proxy failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
