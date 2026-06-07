"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { X } from "lucide-react";
import { VideoPlayer } from "@/components/player/VideoPlayer";
import { useAppStore } from "@/lib/store";
import { posterUrl } from "@/lib/tmdb";
import {
  fetchWithSettings,
  getEffectiveSettings,
  ensurePlexCookies,
} from "@/lib/client-settings";
import type { MediaItem } from "@/lib/types";
import type { StreamTrack } from "@/types/media-tracks";

export default function WatchPage() {
  const params = useParams();
  const router = useRouter();
  const id = decodeURIComponent(params.id as string);
  const [item, setItem] = useState<MediaItem | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [transcodeLoading, setTranscodeLoading] = useState(false);
  const [audioTracks, setAudioTracks] = useState<StreamTrack[]>([]);
  const [subtitleTracks, setSubtitleTracks] = useState<StreamTrack[]>([]);
  const [audioIndex, setAudioIndex] = useState(0);
  const [subtitleIndex, setSubtitleIndex] = useState<number | null>(null);
  const [plexReady, setPlexReady] = useState(false);
  const [forceTranscode, setForceTranscode] = useState(false);
  const [plexRatingKey, setPlexRatingKey] = useState<string | null>(null);
  const [resolveStatus, setResolveStatus] = useState("");
  const updateProgress = useAppStore((s) => s.updateProgress);
  const progress = useAppStore((s) => s.continueWatching[id] ?? 0);
  const storeSettings = useAppStore((s) => s.settings);

  const startTranscode = useCallback(
    async (url: string, audio: number, subtitle: number | null) => {
      setTranscodeLoading(true);
      try {
        const subParam = subtitle === null ? "-1" : String(subtitle);
        const res = await fetch(
          `/api/debrid/transcode?url=${encodeURIComponent(url)}&audio=${audio}&subtitle=${subParam}`
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Transcode failed");
        setStreamUrl(data.streamUrl);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Transcode failed");
      } finally {
        setTranscodeLoading(false);
      }
    },
    []
  );

  // Sync Plex credentials to httpOnly cookies before playback (required for HLS segment requests)
  useEffect(() => {
    let cancelled = false;
    async function prepPlex() {
      const settings = getEffectiveSettings(storeSettings);
      if (settings.plexUrl && settings.plexToken) {
        await ensurePlexCookies(settings);
      }
      if (!cancelled) setPlexReady(true);
    }
    prepPlex();
    return () => {
      cancelled = true;
    };
  }, [storeSettings]);

  useEffect(() => {
    if (!plexReady) return;

    async function load() {
      const settings = getEffectiveSettings(storeSettings);
      const useDirectPlay = settings.directPlay && !forceTranscode;
      const plexMode = useDirectPlay ? "direct" : "transcode";

      if (id.startsWith("debrid-")) {
        const torrentId = id.replace("debrid-", "");
        const token = settings.realDebridToken || process.env.NEXT_PUBLIC_DEBRID_TOKEN;
        if (!token) {
          setError("Real-Debrid token required. Configure in Settings.");
          return;
        }
        try {
          const res = await fetch("/api/debrid", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-debrid-token": token,
            },
            body: JSON.stringify({ action: "resolve", torrentId }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);

          setItem({
            id,
            title: data.filename || "Debrid Stream",
            type: "movie",
            source: "debrid",
          });
          setSourceUrl(data.streamUrl);

          const tracksRes = await fetch(
            `/api/debrid/tracks?url=${encodeURIComponent(data.streamUrl)}`
          );
          const tracksData = await tracksRes.json();

          if (tracksRes.ok) {
            setAudioTracks(tracksData.audio ?? []);
            setSubtitleTracks(tracksData.subtitles ?? []);
            const audio = tracksData.defaultAudioIndex ?? tracksData.audio?.[0]?.index ?? 0;
            setAudioIndex(audio);
            setSubtitleIndex(tracksData.defaultSubtitleIndex ?? null);

            const canDirectPlay =
              useDirectPlay && !forceTranscode && !tracksData.needsTranscode;
            if (canDirectPlay) {
              setStreamUrl(`/api/proxy/stream?url=${encodeURIComponent(data.streamUrl)}`);
              return;
            }

            await startTranscode(data.streamUrl, audio, null);
          } else if (tracksData.ffmpegRequired) {
            setStreamUrl(`/api/proxy/stream?url=${encodeURIComponent(data.streamUrl)}`);
            setError(
              tracksData.error ||
                "ffmpeg not found — video may play but MKV audio (AC3/DTS) will not work in Chrome."
            );
          } else {
            await startTranscode(data.streamUrl, tracksData.defaultAudioIndex ?? 0, null);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to resolve stream");
        }
        return;
      }

      async function playRemoteStream(item: MediaItem, rawUrl: string, proxiedUrl: string) {
        setItem(item);
        setSourceUrl(rawUrl);

        if (useDirectPlay) {
          const tracksRes = await fetch(
            `/api/debrid/tracks?url=${encodeURIComponent(rawUrl)}`
          );
          const tracksData = await tracksRes.json();

          if (tracksRes.ok && tracksData.needsTranscode) {
            setAudioTracks(tracksData.audio ?? []);
            setSubtitleTracks(tracksData.subtitles ?? []);
            const audio = tracksData.defaultAudioIndex ?? tracksData.audio?.[0]?.index ?? 0;
            setAudioIndex(audio);
            setSubtitleIndex(tracksData.defaultSubtitleIndex ?? null);
            await startTranscode(rawUrl, audio, null);
            return;
          }

          setStreamUrl(proxiedUrl);
          return;
        }

        const tracksRes = await fetch(
          `/api/debrid/tracks?url=${encodeURIComponent(rawUrl)}`
        );
        const tracksData = await tracksRes.json();
        if (tracksRes.ok) {
          setAudioTracks(tracksData.audio ?? []);
          setSubtitleTracks(tracksData.subtitles ?? []);
          const audio = tracksData.defaultAudioIndex ?? tracksData.audio?.[0]?.index ?? 0;
          setAudioIndex(audio);
          setSubtitleIndex(tracksData.defaultSubtitleIndex ?? null);
          await startTranscode(rawUrl, audio, null);
        } else {
          setStreamUrl(proxiedUrl);
        }
      }

      async function startPlexPlayback(ratingKey: string) {
        if (!settings.plexUrl || !settings.plexToken) {
          setError("Plex not configured. Go to Settings → enter URL + token → Save & Sync Library.");
          return;
        }
        setPlexRatingKey(ratingKey);
        await ensurePlexCookies(settings);
        const playUrl = `/api/plex/play?ratingKey=${encodeURIComponent(ratingKey)}&mode=${plexMode}&plexUrl=${encodeURIComponent(settings.plexUrl)}`;
        const playRes = await fetchWithSettings(playUrl, settings);
        const playData = await playRes.json();
        if (!playRes.ok) {
          throw new Error(playData.hint || playData.error || "Failed to start playback");
        }
        setStreamUrl(playData.streamUrl);
      }

      if (id.startsWith("tmdb-")) {
        const tmdbId = parseInt(id.replace("tmdb-", ""), 10);
        if (!Number.isFinite(tmdbId)) {
          setError("Invalid title id");
          return;
        }
        try {
          setResolveStatus("Checking Plex library…");
          const resolveRes = await fetchWithSettings(
            `/api/play/resolve?tmdbId=${tmdbId}&type=movie`,
            settings
          );
          const resolved = await resolveRes.json();

          if (!resolveRes.ok) {
            throw new Error(
              resolved.message || resolved.error || "Not in Plex and no torrents found"
            );
          }

          if (resolved.source === "plex" && resolved.item) {
            setResolveStatus("Playing from Plex…");
            setItem(resolved.item);
            const rk =
              resolved.item.plexRatingKey ??
              resolved.watchId?.replace("plex-", "");
            if (rk) {
              await startPlexPlayback(rk);
              return;
            }
          }

          if (resolved.source === "torrentio" && resolved.streamUrl && resolved.item) {
            setResolveStatus("Streaming from Real-Debrid…");
            const proxyUrl = resolved.streamUrl as string;
            const match = proxyUrl.match(/[?&]url=([^&]+)/);
            const rawUrl = match ? decodeURIComponent(match[1]) : proxyUrl;
            await playRemoteStream(resolved.item, rawUrl, proxyUrl);
            return;
          }

          throw new Error("No playable stream found");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Playback failed");
        } finally {
          setResolveStatus("");
        }
        return;
      }

      if (id.startsWith("plex-")) {
        const ratingKey = id.replace("plex-", "");
        try {
          const libraryRes = await fetchWithSettings("/api/library", settings);
          const libData = libraryRes.ok ? await libraryRes.json() : { items: [] };
          const found = (libData.items ?? []).find((i: MediaItem) => i.id === id);
          setItem(
            found ?? {
              id,
              title: "Plex Video",
              type: "movie",
              source: "library",
            }
          );
          await startPlexPlayback(ratingKey);
          return;
        } catch (err) {
          setError(err instanceof Error ? err.message : "Plex playback failed");
          return;
        }
      }

      const libraryRes = await fetchWithSettings("/api/library", settings);
      if (libraryRes.ok) {
        const data = await libraryRes.json();
        const found = (data.items ?? []).find((i: MediaItem) => i.id === id);
        if (found) {
          setItem(found);
          if (found.plexRatingKey || found.id.startsWith("plex-")) {
            const rk = found.plexRatingKey ?? found.id.replace("plex-", "");
            try {
              await startPlexPlayback(rk);
              return;
            } catch (err) {
              setError(err instanceof Error ? err.message : "Plex playback failed");
              return;
            }
          }
          if (found.streamUrl?.includes("/api/plex/stream") && useDirectPlay) {
            await ensurePlexCookies(settings);
            setStreamUrl(found.streamUrl);
            setPlexRatingKey(found.plexRatingKey ?? null);
            return;
          }
          if (found.streamUrl && !found.streamUrl.includes("/api/plex/")) {
            setStreamUrl(found.streamUrl);
            return;
          }
          if (found.filePath) {
            setStreamUrl(`/api/library/stream?path=${encodeURIComponent(found.filePath)}`);
            return;
          }
        }
      }

      setError("No stream available for this title. Add it via your library or Real-Debrid.");
    }
    load();
  }, [id, storeSettings, plexReady, forceTranscode, startTranscode]);

  const handleAudioChange = useCallback(
    (index: number) => {
      if (!sourceUrl) return;
      setAudioIndex(index);
      startTranscode(sourceUrl, index, subtitleIndex);
    },
    [sourceUrl, subtitleIndex, startTranscode]
  );

  const handleSubtitleChange = useCallback(
    (index: number | null) => {
      if (!sourceUrl) return;
      setSubtitleIndex(index);
      startTranscode(sourceUrl, audioIndex, index);
    },
    [sourceUrl, audioIndex, startTranscode]
  );

  const handleRequestTranscode = useCallback(() => {
    setStreamUrl(null);
    setForceTranscode(true);
    setError("");
  }, []);

  const settings = getEffectiveSettings(storeSettings);
  const isDirectPlay =
    settings.directPlay &&
    !forceTranscode &&
    !!streamUrl &&
    (streamUrl.includes("/api/proxy/stream") || streamUrl.includes("/api/plex/stream"));
  const transcodeAvailable =
    !!sourceUrl || !!plexRatingKey || id.startsWith("plex-") || id.startsWith("tmdb-");

  const handleProgress = useCallback(
    (_seconds: number, percent: number) => {
      updateProgress(id, percent);
    },
    [id, updateProgress]
  );

  if (!plexReady) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/30 border-t-white" />
      </div>
    );
  }

  if (error && !streamUrl) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-black px-4 text-center">
        <p className="mb-4 text-lg text-red-400">{error}</p>
        <a href="/settings" className="mb-4 text-sm text-netflix-light-gray underline">
          Open Settings
        </a>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded bg-netflix-red px-6 py-2 font-semibold"
        >
          Go Back
        </button>
      </div>
    );
  }

  if (!streamUrl || !item || transcodeLoading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-black">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/30 border-t-white" />
        <p className="mt-4 text-sm text-netflix-light-gray">
          {transcodeLoading
            ? "Preparing stream with audio..."
            : resolveStatus || "Loading..."}
        </p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <button
        type="button"
        onClick={() => router.back()}
        className="absolute right-4 top-4 z-50 rounded-full bg-black/50 p-2 hover:bg-black/80"
        aria-label="Close player"
      >
        <X className="h-6 w-6" />
      </button>
      {error && (
        <div className="absolute left-4 right-4 top-16 z-50 rounded bg-yellow-900/80 px-4 py-2 text-sm text-yellow-200">
          {error}
        </div>
      )}
      <VideoPlayer
        src={streamUrl}
        title={item.title}
        poster={posterUrl(item.posterPath, "w780")}
        initialProgress={progress}
        onProgress={handleProgress}
        audioTracks={audioTracks}
        subtitleTracks={subtitleTracks}
        audioIndex={audioIndex}
        subtitleIndex={subtitleIndex}
        onAudioChange={handleAudioChange}
        onSubtitleChange={handleSubtitleChange}
        onRequestTranscode={handleRequestTranscode}
        transcodeAvailable={transcodeAvailable}
        isDirectPlay={isDirectPlay}
      />
    </div>
  );
}
