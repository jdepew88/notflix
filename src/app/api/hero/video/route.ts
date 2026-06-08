import { NextRequest, NextResponse } from "next/server";
import { createReadStream, statSync } from "fs";
import { mergeSettingsForServerOps } from "@/lib/settings";
import {
  getHeroVideoFile,
  isHeroVideoGenerating,
  isHeroVideoReady,
  isValidVideoFile,
} from "@/lib/hero-cache";
import { readLibraryCache } from "@/lib/library-cache";
import { resolveHeroVideoWithSync } from "@/lib/hero-resolve";

function streamVideoFile(filePath: string, request: NextRequest): NextResponse {
  const stat = statSync(filePath);
  const fileSize = stat.size;
  const range = request.headers.get("range");

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    if (Number.isNaN(start) || start >= fileSize || end < start) {
      return NextResponse.json({ error: "Invalid range" }, { status: 416 });
    }
    const chunkSize = end - start + 1;

    const stream = createReadStream(filePath, { start, end });
    const readable = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk) => controller.enqueue(chunk));
        stream.on("end", () => controller.close());
        stream.on("error", (err) => controller.error(err));
      },
    });

    return new NextResponse(readable, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunkSize),
        "Content-Type": "video/mp4",
        "Cache-Control": "public, max-age=86400",
      },
    });
  }

  const stream = createReadStream(filePath);
  const readable = new ReadableStream({
    start(controller) {
      stream.on("data", (chunk) => controller.enqueue(chunk));
      stream.on("end", () => controller.close());
      stream.on("error", (err) => controller.error(err));
    },
  });

  return new NextResponse(readable, {
    headers: {
      "Content-Length": String(fileSize),
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=86400",
    },
  });
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const file = getHeroVideoFile(id);
  if (!file || !isValidVideoFile(id)) {
    const settings = mergeSettingsForServerOps(request);
    if (!isHeroVideoGenerating(id)) {
      void resolveHeroVideoWithSync(settings);
    }
    return NextResponse.json({ ready: false }, { status: 404 });
  }

  try {
    return streamVideoFile(file, request);
  } catch {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }
}

export async function POST(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  if (isHeroVideoReady(id)) {
    return NextResponse.json({
      ready: true,
      url: `/api/hero/video?id=${encodeURIComponent(id)}`,
    });
  }

  const settings = mergeSettingsForServerOps(request);
  const cache = readLibraryCache();
  if (!cache) {
    return NextResponse.json({ error: "Library cache not found" }, { status: 404 });
  }

  if (!isHeroVideoGenerating(id)) {
    void resolveHeroVideoWithSync(settings);
  }

  return NextResponse.json({ ready: false, generating: true }, { status: 202 });
}

export async function HEAD(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return new NextResponse(null, { status: 400 });

  const file = getHeroVideoFile(id);
  if (!file || !isValidVideoFile(id)) return new NextResponse(null, { status: 404 });

  try {
    const stat = statSync(file);
    return new NextResponse(null, {
      status: 200,
      headers: {
        "Content-Length": String(stat.size),
        "Content-Type": "video/mp4",
        "Accept-Ranges": "bytes",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
