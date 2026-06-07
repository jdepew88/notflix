import { NextRequest, NextResponse } from "next/server";
import { createReadStream, statSync } from "fs";
import path from "path";
import { mergeSettings } from "@/lib/settings";
import { resolveLibraryPath } from "@/lib/library-path";
import { getMimeType } from "@/lib/library";

export async function GET(request: NextRequest) {
  const filePath = request.nextUrl.searchParams.get("path");
  const settings = mergeSettings(request);
  const libraryPath = resolveLibraryPath(settings.libraryPath);

  if (!filePath || !libraryPath) {
    return NextResponse.json(
      { error: "Missing path or library path not configured" },
      { status: 400 }
    );
  }

  const resolved = path.resolve(filePath);
  const root = path.resolve(libraryPath);

  if (!resolved.startsWith(root)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  try {
    const stat = statSync(resolved);
    const fileSize = stat.size;
    const range = request.headers.get("range");
    const contentType = getMimeType(resolved);

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      if (Number.isNaN(start) || start >= fileSize || end < start) {
        return NextResponse.json({ error: "Invalid range" }, { status: 416 });
      }
      const chunkSize = end - start + 1;

      const stream = createReadStream(resolved, { start, end });
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
          "Content-Type": contentType,
        },
      });
    }

    const stream = createReadStream(resolved);
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
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
