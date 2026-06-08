import { NextRequest, NextResponse } from "next/server";
import { getPlexCredentials } from "@/lib/plex-stream";
import { castCorsHeaders } from "@/lib/cast-cors";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: castCorsHeaders() });
}

export async function GET(request: NextRequest) {
  const partKey = request.nextUrl.searchParams.get("partKey");
  const { plexUrl, token } = getPlexCredentials(request);
  const plexUrlParam = request.nextUrl.searchParams.get("plexUrl");
  const baseUrl = (plexUrlParam || plexUrl).replace(/\/$/, "");

  if (!partKey || !baseUrl || !token) {
    return NextResponse.json({ error: "Missing Plex stream parameters" }, { status: 400 });
  }

  const upstreamUrl = `${baseUrl}${partKey}?X-Plex-Token=${token}`;
  const range = request.headers.get("range");

  try {
    const headers: HeadersInit = {
      Accept: "*/*",
    };
    if (range) headers["Range"] = range;

    const upstream = await fetch(upstreamUrl, { headers });
    const responseHeaders = new Headers();
    responseHeaders.set(
      "Content-Type",
      upstream.headers.get("Content-Type") || guessMime(partKey)
    );
    responseHeaders.set("Accept-Ranges", "bytes");
    const contentLength = upstream.headers.get("Content-Length");
    const contentRange = upstream.headers.get("Content-Range");
    if (contentLength) responseHeaders.set("Content-Length", contentLength);
    if (contentRange) responseHeaders.set("Content-Range", contentRange);
    for (const [key, value] of Object.entries(castCorsHeaders())) {
      responseHeaders.set(key, value);
    }

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Plex stream failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function guessMime(partKey: string): string {
  const lower = partKey.toLowerCase();
  if (lower.endsWith(".mkv")) return "video/x-matroska";
  if (lower.endsWith(".mp4") || lower.endsWith(".m4v")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".avi") || lower.endsWith(".xvid")) return "video/x-msvideo";
  return "video/mp4";
}
