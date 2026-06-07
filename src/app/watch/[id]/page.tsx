"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { X } from "lucide-react";
import { VideoPlayer } from "@/components/player/VideoPlayer";
import { useAppStore, getMediaProgress } from "@/lib/store";
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
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [proxiedStreamUrl, setProxiedStreamUrl] = useState<string | null>(null);
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
  const progress = getMediaProgress(id);
  const storeSettings = useAppStore((s) => s.settings);

  const startTranscode = useCallback(
    async (opts: {
      url?: string | null;
      path?: string | null;
      audio: number;
      subtitle: number | null;
    }) => {
      const subParam = opts.subtitle === null ? "-1" : String(opts.subtitle);
      let query = `audio=${opts.audio}&subtitle=${subParam}`;
      if (opts.path) {
        query = `path=${encodeURIComponent(opts.path)}&${query}`;
      } else if (opts.url) {
        query = `url=${encodeURIComponent(opts.url)}&${query}`;
      } else {
        return;
      }

      setTranscodeLoading(true);
      try {
        const res = await fetch(`/api/debrid/transcode?${query}`);
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

  const applyTrackedPlayback = useCallback(
    async (opts: {
      url?: string;
      path?: string;
      proxiedUrl?: string;
      externalStreamUrl?: string;
      useDirectPlay: boolean;
      subtitleOverride?: number | null;
    }) => {
      const tracksQuery = opts.path
        ? `path=${encodeURIComponent(opts.path)}`
        : `url=${encodeURIComponent(opts.url!)}`;
      const tracksRes = await fetch(`/api/media/tracks?${tracksQuery}`);
      const tracksData = await tracksRes.json();

      if (!tracksRes.ok) {
        if (tracksData.ffmpegRequired && opts.proxiedUrl) {
          setStreamUrl(opts.proxiedUrl);
          setError(
            tracksData.error ||
              "ffmpeg not found — subtitles and some audio codecs require ffmpeg."
          );
          return;
        }
        if (opts.proxiedUrl) setStreamUrl(opts.proxiedUrl);
        else throw new Error(tracksData.error || "Could not read embedded tracks");
        return;
      }

      const audio = tracksData.defaultAudioIndex ?? tracksData.audio?.[0]?.index ?? 0;
      const subtitle: number | null =
        opts.subtitleOverride !== undefined ? opts.subtitleOverride : null;

      setAudioTracks(tracksData.audio ?? []);
      setSubtitleTracks(tracksData.subtitles ?? []);
      setAudioIndex(audio);
      setSubtitleIndex(subtitle);
      setSourceUrl(opts.url ?? null);
      setSourcePath(opts.path ?? null);
      if (opts.proxiedUrl) setProxiedStreamUrl(opts.proxiedUrl);

      const needsSubTranscode = subtitle !== null;
      const canDirectPlay =
        opts.useDirectPlay && !tracksData.needsTranscode && !needsSubTranscode;

      if (canDirectPlay && (opts.proxiedUrl ?? proxiedStreamUrl)) {
        setStreamUrl(opts.proxiedUrl ?? proxiedStreamUrl!);
        return;
      }

      if (
        subtitle === null &&
        !tracksData.needsTranscode &&
        opts.externalStreamUrl
      ) {
        setStreamUrl(opts.externalStreamUrl);
        return;
      }

      await startTranscode({
        url: opts.url,
        path: opts.path,
        audio,
        subtitle,
      });
    },
    [startTranscode, proxiedStreamUrl]
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
      const useDirectPlay = Boolean(settings.directPlay) && !forceTranscode;
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

          await applyTrackedPlayback({
            url: data.streamUrl,
            proxiedUrl: `/api/proxy/stream?url=${encodeURIComponent(data.streamUrl)}`,
            useDirectPlay,
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to resolve stream");
        }
        return;
      }

      async function playRemoteStream(item: MediaItem, rawUrl: string, proxiedUrl: string) {
        setItem(item);
        await applyTrackedPlayback({
          url: rawUrl,
          proxiedUrl,
          useDirectPlay,
        });
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

        const baseUrl = settings.plexUrl.replace(/\/$/, "");
        if (playData.partKey) {
          const upstream = `${baseUrl}${playData.partKey}?X-Plex-Token=${settings.plexToken}`;
          if (playData.mode === "direct") {
            await applyTrackedPlayback({
              url: upstream,
              proxiedUrl: playData.streamUrl,
              useDirectPlay,
            });
            return;
          }

          await applyTrackedPlayback({
            url: upstream,
            proxiedUrl: playData.streamUrl,
            externalStreamUrl: playData.streamUrl,
            useDirectPlay: false,
          });
          return;
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
            setPlexRatingKey(found.plexRatingKey ?? null);
            if (settings.plexUrl && settings.plexToken && found.plexPartKey) {
              const upstream = `${settings.plexUrl.replace(/\/$/, "")}${found.plexPartKey}?X-Plex-Token=${settings.plexToken}`;
              await applyTrackedPlayback({
                url: upstream,
                proxiedUrl: found.streamUrl,
                useDirectPlay,
              });
              return;
            }
            setStreamUrl(found.streamUrl);
            return;
          }
          if (found.streamUrl && !found.streamUrl.includes("/api/plex/")) {
            setStreamUrl(found.streamUrl);
            return;
          }
          if (found.filePath) {
            await applyTrackedPlayback({
              path: found.filePath,
              proxiedUrl: `/api/library/stream?path=${encodeURIComponent(found.filePath)}`,
              useDirectPlay,
            });
            return;
          }
        }
      }

      setError("No stream available for this title. Add it via your library or Real-Debrid.");
    }
    load();
  }, [id, storeSettings, plexReady, forceTranscode, applyTrackedPlayback]);

  const handleAudioChange = useCallback(
    (index: number) => {
      if (!sourceUrl && !sourcePath) return;
      setAudioIndex(index);
      startTranscode({ url: sourceUrl, path: sourcePath, audio: index, subtitle: subtitleIndex });
    },
    [sourceUrl, sourcePath, subtitleIndex, startTranscode]
  );

  const handleSubtitleChange = useCallback(
    (index: number | null) => {
      if (!sourceUrl && !sourcePath) return;
      setSubtitleIndex(index);
      const settings = getEffectiveSettings(storeSettings);
      void applyTrackedPlayback({
        url: sourceUrl ?? undefined,
        path: sourcePath ?? undefined,
        proxiedUrl: proxiedStreamUrl ?? undefined,
        useDirectPlay: Boolean(settings.directPlay) && !forceTranscode,
        subtitleOverride: index,
      });
    },
    [sourceUrl, sourcePath, proxiedStreamUrl, applyTrackedPlayback, storeSettings, forceTranscode]
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
  const transcodeAvailable = !!sourceUrl || !!sourcePath || !!plexRatingKey;
  const hasTrackControls =
    audioTracks.length > 1 || subtitleTracks.length > 0;

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
            ? "Preparing stream with subtitles..."
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
        onSubtitleChange={hasTrackControls ? handleSubtitleChange : undefined}
        onAudioChange={hasTrackControls ? handleAudioChange : undefined}
        onRequestTranscode={handleRequestTranscode}
        transcodeAvailable={transcodeAvailable}
        isDirectPlay={isDirectPlay}
        plexToken={settings.plexToken}
        plexRatingKey={plexRatingKey ?? undefined}
        plexUrl={settings.plexUrl}
      />
    </div>
  );
}
