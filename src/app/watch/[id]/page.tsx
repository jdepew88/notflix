"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { VideoPlayer } from "@/components/player/VideoPlayer";
import { StreamPicker } from "@/components/player/StreamPicker";
import { useAppStore, getMediaProgress } from "@/lib/store";
import { posterUrl } from "@/lib/tmdb";
import {
  fetchWithSettings,
  getEffectiveSettings,
  ensurePlexCookies,
} from "@/lib/client-settings";
import type { MediaItem } from "@/lib/types";
import type { StreamTrack } from "@/types/media-tracks";
import type { TorrentioStreamOption } from "@/lib/torrentio";
import { libraryStreamUrl, mappedLibraryFilePath } from "@/lib/library-playback";
import { readJsonResponse } from "@/lib/fetch-json";

function buildPlayQuery(opts: {
  tmdbId: number;
  type: "movie" | "series";
  season?: number;
  episode?: number;
}): string {
  const params = new URLSearchParams();
  params.set("tmdbId", String(opts.tmdbId));
  params.set("type", opts.type);
  if (opts.season != null) params.set("season", String(opts.season));
  if (opts.episode != null) params.set("episode", String(opts.episode));
  return params.toString();
}

export default function WatchPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [torrentStreams, setTorrentStreams] = useState<TorrentioStreamOption[] | null>(null);
  const [playQuery, setPlayQuery] = useState<string | null>(null);
  const [openingStreamIndex, setOpeningStreamIndex] = useState<number | null>(null);
  const [streamQuality, setStreamQuality] = useState<string | null>(null);
  const [isDebridPlayback, setIsDebridPlayback] = useState(false);
  const [streamSession, setStreamSession] = useState<string | null>(null);
  const updateProgress = useAppStore((s) => s.updateProgress);
  const progress = getMediaProgress(id);
  const storeSettings = useAppStore((s) => s.settings);

  const startRemux = useCallback(
    async (opts: {
      session?: string | null;
      url?: string | null;
      path?: string | null;
      audio: number;
      subtitle: number | null;
    }) => {
      const subParam = opts.subtitle === null ? "-1" : String(opts.subtitle);
      let query = `audio=${opts.audio}&subtitle=${subParam}`;
      if (opts.session) {
        query = `session=${encodeURIComponent(opts.session)}&${query}`;
      } else if (opts.path) {
        query = `path=${encodeURIComponent(opts.path)}&${query}`;
      } else if (opts.url) {
        query = `url=${encodeURIComponent(opts.url)}&${query}`;
      } else {
        return;
      }

      setTranscodeLoading(true);
      try {
        const res = await fetch(`/api/debrid/remux?${query}`);
        const data = await readJsonResponse<{ streamUrl?: string; error?: string }>(res);
        if (!res.ok) throw new Error(data.error || "Remux failed");
        setStreamUrl(data.streamUrl!);
        setError("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Remux failed");
      } finally {
        setTranscodeLoading(false);
      }
    },
    []
  );

  const startTranscode = useCallback(
    async (opts: {
      session?: string | null;
      url?: string | null;
      path?: string | null;
      audio: number;
      subtitle: number | null;
    }) => {
      const subParam = opts.subtitle === null ? "-1" : String(opts.subtitle);
      let query = `audio=${opts.audio}&subtitle=${subParam}`;
      if (opts.session) {
        query = `session=${encodeURIComponent(opts.session)}&${query}`;
      } else if (opts.path) {
        query = `path=${encodeURIComponent(opts.path)}&${query}`;
      } else if (opts.url) {
        query = `url=${encodeURIComponent(opts.url)}&${query}`;
      } else {
        return;
      }

      setTranscodeLoading(true);
      try {
        const res = await fetch(`/api/debrid/transcode?${query}`);
        const data = await readJsonResponse<{ streamUrl?: string; error?: string }>(res);
        if (!res.ok) throw new Error(data.error || "Transcode failed");
        setStreamUrl(data.streamUrl!);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Transcode failed");
      } finally {
        setTranscodeLoading(false);
      }
    },
    []
  );

  const fetchMediaTracks = useCallback(
    async (opts: { session?: string | null; url?: string; path?: string }) => {
      if (opts.session) {
        return fetch(`/api/media/tracks?session=${encodeURIComponent(opts.session)}`);
      }
      if (opts.path) {
        return fetch(`/api/media/tracks?path=${encodeURIComponent(opts.path)}`);
      }
      if (opts.url && opts.url.length < 1800) {
        return fetch(`/api/media/tracks?url=${encodeURIComponent(opts.url)}`);
      }
      if (opts.url) {
        return fetch("/api/media/tracks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: opts.url }),
        });
      }
      throw new Error("No stream source for track probe");
    },
    []
  );

  const applyTrackedPlayback = useCallback(
    async (opts: {
      url?: string;
      path?: string;
      session?: string | null;
      proxiedUrl?: string;
      externalStreamUrl?: string;
      useDirectPlay: boolean;
      subtitleOverride?: number | null;
      debridDirectPlay?: boolean;
    }) => {
      const tracksRes = await fetchMediaTracks({
        session: opts.session,
        path: opts.path,
        url: opts.url,
      });
      const tracksData = await readJsonResponse<{
        error?: string;
        ffmpegRequired?: boolean;
        defaultAudioIndex?: number;
        audio?: StreamTrack[];
        subtitles?: StreamTrack[];
        needsTranscode?: boolean;
      }>(tracksRes);

      if (!tracksRes.ok) {
        if (opts.debridDirectPlay && opts.proxiedUrl) {
          setStreamUrl(opts.proxiedUrl);
          setError(
            tracksData.error ||
              "Could not read embedded tracks — playing direct stream."
          );
          return;
        }
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
      setStreamSession(opts.session ?? null);
      if (opts.proxiedUrl) setProxiedStreamUrl(opts.proxiedUrl);

      if (opts.debridDirectPlay && opts.proxiedUrl) {
        if (subtitle !== null) {
          await startRemux({
            session: opts.session,
            url: opts.url,
            path: opts.path,
            audio,
            subtitle,
          });
          return;
        }
        setStreamUrl(opts.proxiedUrl);
        return;
      }

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
        session: opts.session,
        url: opts.url,
        path: opts.path,
        audio,
        subtitle,
      });
    },
    [startTranscode, startRemux, proxiedStreamUrl, fetchMediaTracks]
  );

  const playRemoteStream = useCallback(
    async (
      mediaItem: MediaItem,
      rawUrl: string,
      proxiedUrl: string,
      debrid = false,
      session?: string | null
    ) => {
      const settings = getEffectiveSettings(storeSettings);
      const useDirectPlay = Boolean(settings.directPlay) && !forceTranscode;
      setIsDebridPlayback(debrid);
      setItem(mediaItem);
      await applyTrackedPlayback({
        url: rawUrl,
        session,
        proxiedUrl,
        useDirectPlay,
        debridDirectPlay: debrid,
      });
    },
    [storeSettings, forceTranscode, applyTrackedPlayback]
  );

  const handleStreamSelect = useCallback(
    async (streamIndex: number) => {
      if (!playQuery) return;
      const settings = getEffectiveSettings(storeSettings);
      setOpeningStreamIndex(streamIndex);
      setError("");
      try {
        const res = await fetchWithSettings(
          `/api/play/open?${playQuery}&streamIndex=${streamIndex}`,
          settings
        );
        const data = await readJsonResponse<{
          error?: string;
          streamUrl?: string;
          streamSession?: string;
          item?: MediaItem;
        }>(res);
        if (!res.ok) throw new Error(data.error || "Failed to open stream");

        const selected = torrentStreams?.find((s) => s.index === streamIndex);
        setStreamQuality(selected?.quality ?? null);
        setTorrentStreams(null);
        setPlayQuery(null);
        const proxyUrl = data.streamUrl as string;
        setStreamSession(data.streamSession ?? null);
        await playRemoteStream(
          data.item ?? item!,
          "",
          proxyUrl,
          true,
          data.streamSession ?? null
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to open stream");
      } finally {
        setOpeningStreamIndex(null);
      }
    },
    [playQuery, storeSettings, playRemoteStream, item, torrentStreams]
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
      setTorrentStreams(null);
      setPlayQuery(null);
      setOpeningStreamIndex(null);
      setStreamQuality(null);
      setIsDebridPlayback(false);
      setStreamSession(null);
      setError("");

      const settings = getEffectiveSettings(storeSettings);
      const useDirectPlay = Boolean(settings.directPlay) && !forceTranscode;
      const plexMode = useDirectPlay ? "direct" : "transcode";

      let lookupId = id;
      if (id.startsWith("series-")) {
        const seriesRes = await fetchWithSettings("/api/library", settings);
        if (seriesRes.ok) {
          const seriesData = await seriesRes.json();
          for (const row of seriesData.rows ?? []) {
            const card = (row.items ?? []).find((i: MediaItem) => i.id === id);
            if (card?.seriesId) {
              lookupId = card.seriesId;
              break;
            }
          }
        }
      }

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
          const data = await readJsonResponse<{
            error?: string;
            streamUrl?: string;
            streamSession?: string;
            filename?: string;
          }>(res);
          if (!res.ok) throw new Error(data.error);

          setItem({
            id,
            title: data.filename || "Debrid Stream",
            type: "movie",
            source: "debrid",
          });
          setSourceUrl(null);
          setStreamSession(data.streamSession ?? null);
          setIsDebridPlayback(true);

          await applyTrackedPlayback({
            session: data.streamSession ?? null,
            proxiedUrl: data.streamUrl,
            useDirectPlay: true,
            debridDirectPlay: true,
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to resolve stream");
        }
        return;
      }

      async function startLibraryFilePlayback(media: MediaItem) {
        if (!media.filePath) {
          throw new Error("No local file path for this title");
        }
        const mapped = mappedLibraryFilePath(media.filePath);
        await applyTrackedPlayback({
          path: mapped,
          proxiedUrl: libraryStreamUrl(media.filePath),
          useDirectPlay,
        });
      }

      async function startPlexPlayback(ratingKey: string, fallbackItem?: MediaItem) {
        if (!settings.plexUrl || !settings.plexToken) {
          if (fallbackItem?.filePath) {
            await startLibraryFilePlayback(fallbackItem);
            return;
          }
          setError("Plex not configured. Go to Settings → enter URL + token → Save & Sync Library.");
          return;
        }
        setPlexRatingKey(ratingKey);
        try {
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
        } catch (err) {
          if (fallbackItem?.filePath) {
            await startLibraryFilePlayback(fallbackItem);
            return;
          }
          throw err;
        }
      }

      if (id.startsWith("tmdb-")) {
        const tmdbId = parseInt(id.replace("tmdb-", ""), 10);
        if (!Number.isFinite(tmdbId)) {
          setError("Invalid title id");
          return;
        }
        const type = (searchParams.get("type") ?? "movie") as "movie" | "series";
        const season = searchParams.get("season")
          ? parseInt(searchParams.get("season")!, 10)
          : undefined;
        const episode = searchParams.get("episode")
          ? parseInt(searchParams.get("episode")!, 10)
          : undefined;

        try {
          setResolveStatus("Checking Plex library…");
          const query = buildPlayQuery({ tmdbId, type, season, episode });
          const streamsRes = await fetchWithSettings(`/api/play/streams?${query}`, settings);
          const sources = await streamsRes.json();

          if (!streamsRes.ok) {
            throw new Error(
              sources.message || sources.error || "Not in Plex and no torrents found"
            );
          }

          if ((sources.source === "plex" || sources.source === "library") && sources.item) {
            setResolveStatus(
              sources.source === "library" ? "Playing from library folder…" : "Playing from Plex…"
            );
            setItem(sources.item);
            if (sources.source === "library" && sources.item.filePath) {
              await startLibraryFilePlayback(sources.item);
              return;
            }
            const rk =
              sources.item.plexRatingKey ??
              sources.plexRatingKey ??
              sources.watchId?.replace("plex-", "");
            if (rk) {
              await startPlexPlayback(rk, sources.item);
              return;
            }
            if (sources.item.filePath) {
              await startLibraryFilePlayback(sources.item);
              return;
            }
          }

          if (sources.source === "torrentio" && sources.streams?.length) {
            setResolveStatus("");
            setItem(sources.item ?? null);
            setPlayQuery(query);
            setTorrentStreams(sources.streams);
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
        let found: MediaItem | undefined;
        try {
          const libraryRes = await fetchWithSettings("/api/library", settings);
          const libData = libraryRes.ok ? await libraryRes.json() : { items: [] };
          found = (libData.items ?? []).find((i: MediaItem) => i.id === id);
          setItem(
            found ?? {
              id,
              title: "Plex Video",
              type: "movie",
              source: "library",
            }
          );
          await startPlexPlayback(ratingKey, found);
          return;
        } catch (err) {
          if (found?.filePath) {
            try {
              setItem(found);
              await startLibraryFilePlayback(found);
              return;
            } catch {
              /* fall through */
            }
          }
          setError(err instanceof Error ? err.message : "Plex playback failed");
          return;
        }
      }

      const libraryRes = await fetchWithSettings("/api/library", settings);
      if (libraryRes.ok) {
        const data = await libraryRes.json();
        const found = (data.items ?? []).find((i: MediaItem) => i.id === lookupId);
        if (found) {
          setItem(found);
          if (found.plexRatingKey || found.id.startsWith("plex-")) {
            const rk = found.plexRatingKey ?? found.id.replace("plex-", "");
            try {
              await startPlexPlayback(rk, found);
              return;
            } catch (err) {
              if (found.filePath) {
                try {
                  await startLibraryFilePlayback(found);
                  return;
                } catch {
                  /* fall through */
                }
              }
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
            await startLibraryFilePlayback(found);
            return;
          }
        }
      }

      setError("No stream available for this title. Add it via your library or Real-Debrid.");
    }
    load();
  }, [id, searchParams, storeSettings, plexReady, forceTranscode, applyTrackedPlayback]);

  const handleAudioChange = useCallback(
    (index: number) => {
      if (!sourceUrl && !sourcePath && !streamSession) return;
      setAudioIndex(index);
      if (isDebridPlayback) {
        startRemux({
          session: streamSession,
          url: sourceUrl,
          path: sourcePath,
          audio: index,
          subtitle: subtitleIndex,
        });
        return;
      }
      startTranscode({
        session: streamSession,
        url: sourceUrl,
        path: sourcePath,
        audio: index,
        subtitle: subtitleIndex,
      });
    },
    [sourceUrl, sourcePath, streamSession, subtitleIndex, startTranscode, startRemux, isDebridPlayback]
  );

  const handleSubtitleChange = useCallback(
    (index: number | null) => {
      if (!sourceUrl && !sourcePath && !streamSession) return;
      setSubtitleIndex(index);
      if (isDebridPlayback) {
        if (index === null && proxiedStreamUrl) {
          setStreamUrl(proxiedStreamUrl);
          setError("");
          return;
        }
        startRemux({
          session: streamSession,
          url: sourceUrl,
          path: sourcePath,
          audio: audioIndex,
          subtitle: index,
        });
        return;
      }
      const settings = getEffectiveSettings(storeSettings);
      void applyTrackedPlayback({
        session: streamSession,
        url: sourceUrl ?? undefined,
        path: sourcePath ?? undefined,
        proxiedUrl: proxiedStreamUrl ?? undefined,
        useDirectPlay: Boolean(settings.directPlay) && !forceTranscode,
        subtitleOverride: index,
      });
    },
    [
      sourceUrl,
      sourcePath,
      streamSession,
      audioIndex,
      proxiedStreamUrl,
      applyTrackedPlayback,
      storeSettings,
      forceTranscode,
      isDebridPlayback,
      startRemux,
    ]
  );

  const handleRequestTranscode = useCallback(() => {
    setStreamUrl(null);
    setForceTranscode(true);
    setError("");
  }, []);

  const settings = getEffectiveSettings(storeSettings);
  const isDirectPlay =
    (isDebridPlayback || settings.directPlay) &&
    !forceTranscode &&
    !!streamUrl &&
    (streamUrl.includes("/api/proxy/stream") ||
      streamUrl.includes("/api/plex/stream"));
  const transcodeAvailable =
    !isDebridPlayback && (!!sourceUrl || !!sourcePath || !!streamSession || !!plexRatingKey);
  const hasTrackControls =
    audioTracks.length > 0 || subtitleTracks.length > 0;

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

  if (torrentStreams && torrentStreams.length > 0 && item) {
    return (
      <StreamPicker
        title={item.title}
        subtitle={
          searchParams.get("season") && searchParams.get("episode")
            ? `Season ${searchParams.get("season")} · Episode ${searchParams.get("episode")}`
            : undefined
        }
        streams={torrentStreams}
        onSelect={handleStreamSelect}
        onCancel={() => router.back()}
        openingIndex={openingStreamIndex}
        error={error || undefined}
      />
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
            ? isDebridPlayback
              ? "Switching audio or subtitles..."
              : "Preparing stream with subtitles..."
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
        qualityHint={streamQuality}
      />
    </div>
  );
}
