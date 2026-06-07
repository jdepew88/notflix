import { NextRequest, NextResponse } from "next/server";
import { castCorsHeaders } from "@/lib/cast-cors";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: castCorsHeaders() });
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const isAllowed =
      host.endsWith("real-debrid.com") ||
      host.endsWith("real-debrid.fr") ||
      host.includes("real-debrid");
    if (!isAllowed) {
      return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
    }

    const range = request.headers.get("range");
    const headers: HeadersInit = {};
    if (range) headers["Range"] = range;

    const upstream = await fetch(url, { headers });
    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", upstream.headers.get("Content-Type") || "video/mp4");
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
    const message = err instanceof Error ? err.message : "Proxy error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
