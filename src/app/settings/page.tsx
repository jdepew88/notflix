"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Check, X, RefreshCw } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { syncSettingsToServer, fetchWithSettings } from "@/lib/client-settings";
import { CONTAINER_VIDEO_PATH, HOST_VIDEO_PATH } from "@/lib/library-path";
import { isPlexUnauthorizedMessage } from "@/lib/plex-auth-client";
import { cn } from "@/lib/cn";

export default function SettingsPage() {
  const settings = useAppStore((s) => s.settings);
  const user = useAppStore((s) => s.user);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const [form, setForm] = useState(settings);
  const [saved, setSaved] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState("");
  const [debridStatus, setDebridStatus] = useState<"idle" | "checking" | "ok" | "error">("idle");
  const [plexStatus, setPlexStatus] = useState<"idle" | "checking" | "ok" | "error">("idle");
  const [plexServer, setPlexServer] = useState("");
  const [tvdbStatus, setTvdbStatus] = useState<"idle" | "checking" | "ok" | "error">("idle");
  const [libraryStatus, setLibraryStatus] = useState<"idle" | "checking" | "ok" | "error">("idle");
  const [libraryMessage, setLibraryMessage] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState("");
  const [plexSigningIn, setPlexSigningIn] = useState(false);
  const [plexNeedsSignIn, setPlexNeedsSignIn] = useState(false);
  const plexPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const plexPollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (plexPollRef.current) clearInterval(plexPollRef.current);
      if (plexPollTimeoutRef.current) clearTimeout(plexPollTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const saveAndSync = async () => {
    updateSettings(form);
    setSyncing(true);
    setSyncResult("");
    try {
      await syncSettingsToServer(form);
      const configRes = await fetch("/api/settings/sync?config=1", { credentials: "same-origin" });
      if (configRes.ok) {
        const configData = await configRes.json();
        if (configData.settings) {
          updateSettings(configData.settings);
          setForm(configData.settings);
        }
      }
      const libRes = await fetchWithSettings("/api/library", form);
      const libData = libRes.ok ? await libRes.json() : null;
      setSaved(true);
      if (libData?.count) {
        setSyncResult(`Synced! Found ${libData.count} titles from ${libData.source}.`);
      } else if (libData?.message) {
        setSyncResult(libData.message);
      } else if (libData?.error) {
        setSyncResult(`Error: ${libData.error}`);
      } else {
        setSyncResult("Settings saved. Configure Plex or library path to load media.");
      }
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setSyncResult("Failed to sync settings.");
    } finally {
      setSyncing(false);
    }
  };

  const stopPlexPoll = () => {
    if (plexPollRef.current) {
      clearInterval(plexPollRef.current);
      plexPollRef.current = null;
    }
    if (plexPollTimeoutRef.current) {
      clearTimeout(plexPollTimeoutRef.current);
      plexPollTimeoutRef.current = null;
    }
    setPlexSigningIn(false);
  };

  const applyPlexAuth = async (auth: {
    plexToken: string;
    plexUrl?: string;
    serverName?: string;
  }) => {
    const nextForm = {
      ...form,
      plexToken: auth.plexToken,
      plexUrl: auth.plexUrl || form.plexUrl,
    };
    setForm(nextForm);
    updateSettings(nextForm);
    setPlexNeedsSignIn(false);
    setPlexStatus("ok");
    setPlexServer(auth.serverName ? `Signed in — ${auth.serverName}` : "Signed in to Plex");
    await syncSettingsToServer(nextForm);
  };

  const signInWithPlex = async () => {
    stopPlexPoll();
    setPlexSigningIn(true);
    setPlexServer("");
    setPlexNeedsSignIn(false);
    try {
      const res = await fetch("/api/plex/auth/pin", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start Plex sign-in");

      window.open(data.authUrl, "plex-auth", "width=520,height=720");

      plexPollRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/plex/auth/pin?pinId=${encodeURIComponent(data.pinId)}`);
          const pollData = await pollRes.json();
          if (!pollRes.ok) throw new Error(pollData.error || "Plex sign-in failed");
          if (pollData.status !== "authorized") return;

          stopPlexPoll();
          await applyPlexAuth(pollData);
        } catch (err) {
          stopPlexPoll();
          setPlexStatus("error");
          setPlexServer(err instanceof Error ? err.message : "Plex sign-in failed");
        }
      }, 2000);

      plexPollTimeoutRef.current = setTimeout(() => {
        stopPlexPoll();
        setPlexStatus("error");
        setPlexServer("Plex sign-in timed out. Try again.");
      }, 120000);
    } catch (err) {
      stopPlexPoll();
      setPlexStatus("error");
      setPlexServer(err instanceof Error ? err.message : "Plex sign-in failed");
    }
  };

  const testDebrid = async () => {
    if (!form.realDebridToken) return;
    setDebridStatus("checking");
    try {
      const res = await fetch("/api/debrid", {
        headers: { "x-debrid-token": form.realDebridToken },
      });
      setDebridStatus(res.ok ? "ok" : "error");
    } catch {
      setDebridStatus("error");
    }
  };

  const testPlex = async () => {
    if (!form.plexUrl || !form.plexToken) return;
    setPlexStatus("checking");
    setPlexServer("");
    setPlexNeedsSignIn(false);
    try {
      const res = await fetchWithSettings("/api/settings/sync?test=plex", form);
      const data = await res.json();
      if (data.ok) {
        setPlexStatus("ok");
        setPlexServer(data.serverName ?? "Connected");
      } else {
        setPlexStatus("error");
        setPlexServer(data.error ?? "Failed");
        setPlexNeedsSignIn(isPlexUnauthorizedMessage(data.error));
      }
    } catch {
      setPlexStatus("error");
    }
  };

  const testTvdb = async () => {
    if (!form.tvdbApiKey) return;
    setTvdbStatus("checking");
    try {
      const res = await fetchWithSettings("/api/settings/sync?test=tvdb", form);
      const data = await res.json();
      setTvdbStatus(data.ok ? "ok" : "error");
    } catch {
      setTvdbStatus("error");
    }
  };

  const testLibraryPath = async () => {
    setLibraryStatus("checking");
    setLibraryMessage("");
    try {
      const res = await fetchWithSettings("/api/settings/diagnostics?action=library", form);
      const data = await res.json();
      setLibraryStatus(data.ok ? "ok" : "error");
      const hint = data.hostHint ? ` (host: ${data.hostHint})` : "";
      setLibraryMessage((data.message ?? data.error ?? "") + hint);
    } catch {
      setLibraryStatus("error");
      setLibraryMessage("Diagnostics request failed");
    }
  };

  const testVideoFolder = async () => {
    setLibraryStatus("checking");
    setLibraryMessage("");
    try {
      const res = await fetchWithSettings(
        `/api/settings/diagnostics?action=video&path=${encodeURIComponent(CONTAINER_VIDEO_PATH)}`,
        form
      );
      const data = await res.json();
      setLibraryStatus(data.ok ? "ok" : "error");
      const hint = data.hostHint
        ? ` Host path: ${data.hostHint}`
        : "";
      setLibraryMessage((data.message ?? data.error ?? "") + hint);
    } catch {
      setLibraryStatus("error");
      setLibraryMessage("Video folder test failed");
    }
  };

  const testPlexDiagnostics = async () => {
    setPlexStatus("checking");
    setPlexServer("");
    setPlexNeedsSignIn(false);
    try {
      const res = await fetchWithSettings("/api/settings/diagnostics?action=plex", form);
      const data = await res.json();
      if (data.ok) {
        setPlexStatus("ok");
        setPlexServer(data.message ?? "Connected");
      } else {
        setPlexStatus("error");
        setPlexServer(data.error ?? "Failed");
        setPlexNeedsSignIn(isPlexUnauthorizedMessage(data.error));
      }
    } catch {
      setPlexStatus("error");
    }
  };

  const forceRefreshPlex = async () => {
    setRefreshing(true);
    setRefreshResult("");
    try {
      const res = await fetchWithSettings("/api/library/refresh", form, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setRefreshResult(data.message ?? `Refreshed ${data.titleCount} titles`);
      } else {
        setRefreshResult(data.error ?? "Refresh failed");
      }
    } catch {
      setRefreshResult("Refresh request failed");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="min-h-screen bg-netflix-black px-4 py-8 md:px-12 lg:px-16">
      <Link
        href={user ? "/browse" : "/"}
        className="mb-8 inline-flex items-center gap-2 text-sm hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        {user ? "Back to Browse" : "Back to Sign In"}
      </Link>

      <h1 className="mb-2 text-3xl font-semibold">Settings</h1>
      <p className="mb-8 text-netflix-light-gray">
        Configure Plex to pull your library. Settings are loaded from server <code className="text-white">.env</code>{" "}
        and saved to persistent storage — they survive container reboots. Click{" "}
        <strong className="text-white">Save & Sync Library</strong> after editing.
      </p>

      <div className="mx-auto max-w-2xl space-y-8">
        <section className="rounded bg-netflix-dark p-6">
          <h2 className="mb-4 text-xl font-semibold">Content source</h2>
          <p className="mb-4 text-sm text-netflix-light-gray">
            Plex-only mode shows titles from your Plex library only — no TMDB filler rows or
            Real-Debrid fallback. Recommended for a pure home-theater experience.
          </p>
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={form.plexOnly ?? true}
              onChange={(e) => setForm({ ...form, plexOnly: e.target.checked })}
              className="h-4 w-4 rounded accent-netflix-red"
            />
            <span className="text-sm">Plex library only (hide TMDB &amp; Debrid)</span>
          </label>
        </section>

        <section className="rounded bg-netflix-dark p-6">
          <h2 className="mb-4 text-xl font-semibold">Diagnostics</h2>
          <p className="mb-4 text-sm text-netflix-light-gray">
            Test Plex connectivity and verify the video folder is readable inside the container.
            Mount <code className="text-white">{HOST_VIDEO_PATH}</code> as{" "}
            <code className="text-white">{CONTAINER_VIDEO_PATH}</code> in Docker (
            <code className="text-white">-v /mnt/user/Media:/media:ro</code>).
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={testPlexDiagnostics}
              disabled={!form.plexUrl || !form.plexToken}
              className="rounded border border-white/30 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-40"
            >
              Test Plex server
              {plexStatus === "checking" && "..."}
              {plexStatus === "ok" && <Check className="ml-1 inline h-4 w-4 text-green-400" />}
              {plexStatus === "error" && <X className="ml-1 inline h-4 w-4 text-red-400" />}
            </button>
            <button
              type="button"
              onClick={testVideoFolder}
              className="rounded border border-white/30 px-4 py-2 text-sm hover:bg-white/10"
            >
              Test {CONTAINER_VIDEO_PATH}
              {libraryStatus === "checking" && "..."}
              {libraryStatus === "ok" && <Check className="ml-1 inline h-4 w-4 text-green-400" />}
              {libraryStatus === "error" && <X className="ml-1 inline h-4 w-4 text-red-400" />}
            </button>
            <button
              type="button"
              onClick={testLibraryPath}
              className="rounded border border-white/30 px-4 py-2 text-sm hover:bg-white/10"
            >
              Test library path
            </button>
            <button
              type="button"
              onClick={forceRefreshPlex}
              disabled={refreshing || !form.plexUrl || !form.plexToken}
              className="flex items-center gap-2 rounded border border-white/30 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-40"
            >
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
              Force refresh Plex
            </button>
          </div>
          {plexServer && plexStatus === "ok" && (
            <p className="mt-3 text-sm text-green-400">{plexServer}</p>
          )}
          {plexServer && plexStatus === "error" && (
            <p className="mt-3 text-sm text-red-400">{plexServer}</p>
          )}
          {plexNeedsSignIn && (
            <div className="mt-3 rounded border border-yellow-500/30 bg-yellow-900/20 px-4 py-3 text-sm">
              <p className="text-yellow-100">
                Plex rejected the token (401). Sign in with Plex to get a fresh token and server URL.
              </p>
              <button
                type="button"
                onClick={signInWithPlex}
                disabled={plexSigningIn}
                className="mt-3 rounded bg-netflix-red px-4 py-2 text-sm font-semibold hover:bg-netflix-red-hover disabled:opacity-60"
              >
                {plexSigningIn ? "Waiting for Plex sign-in..." : "Sign in with Plex"}
              </button>
            </div>
          )}
          {libraryMessage && (
            <p
              className={cn(
                "mt-3 text-sm",
                libraryStatus === "ok" ? "text-green-400" : "text-red-400"
              )}
            >
              {libraryMessage}
            </p>
          )}
          {refreshResult && (
            <p className="mt-3 text-sm text-netflix-light-gray">{refreshResult}</p>
          )}
        </section>

        <section className="rounded bg-netflix-dark p-6">
          <h2 className="mb-4 text-xl font-semibold">Plex Server</h2>
          <p className="mb-4 text-sm text-netflix-light-gray">
            Sign in with Plex to connect automatically, or paste your server URL and token manually.
          </p>
          <button
            type="button"
            onClick={signInWithPlex}
            disabled={plexSigningIn}
            className="mb-4 rounded bg-[#e5a00d] px-5 py-2.5 text-sm font-semibold text-black hover:bg-[#f5b020] disabled:opacity-60"
          >
            {plexSigningIn ? "Waiting for Plex sign-in..." : "Sign in with Plex"}
          </button>
          <p className="mb-4 text-xs text-netflix-gray">
            Opens plex.tv in a popup. After you approve access, Notflix fills in your token and server URL.
          </p>
          <label className="mb-1 block text-sm text-netflix-light-gray">Plex server URL</label>
          <input
            type="text"
            value={form.plexUrl}
            onChange={(e) => setForm({ ...form, plexUrl: e.target.value })}
            placeholder="http://192.168.1.100:32400"
            className="mb-4 w-full rounded bg-[#333] px-4 py-3 focus:outline-none focus:ring-2 focus:ring-white/30"
          />
          <label className="mb-1 block text-sm text-netflix-light-gray">Plex token</label>
          <input
            type="password"
            value={form.plexToken}
            onChange={(e) => setForm({ ...form, plexToken: e.target.value })}
            placeholder="X-Plex-Token"
            className="mb-3 w-full rounded bg-[#333] px-4 py-3 focus:outline-none focus:ring-2 focus:ring-white/30"
          />
          <button
            type="button"
            onClick={testPlex}
            className="text-sm text-netflix-light-gray hover:text-white"
          >
            Test Plex connection
            {plexStatus === "checking" && "..."}
            {plexStatus === "ok" && <Check className="ml-1 inline h-4 w-4 text-green-400" />}
            {plexStatus === "error" && <X className="ml-1 inline h-4 w-4 text-red-400" />}
          </button>
          {plexServer && plexStatus === "ok" && (
            <p className="mt-2 text-sm text-green-400">{plexServer}</p>
          )}
          {plexServer && plexStatus === "error" && (
            <p className="mt-2 text-sm text-red-400">{plexServer}</p>
          )}
          {plexNeedsSignIn && (
            <div className="mt-3 rounded border border-yellow-500/30 bg-yellow-900/20 px-4 py-3 text-sm">
              <p className="text-yellow-100">
                Token unauthorized. Use Sign in with Plex above to refresh your credentials.
              </p>
            </div>
          )}
        </section>

        <section className="rounded bg-netflix-dark p-6">
          <h2 className="mb-4 text-xl font-semibold">TheTVDB (TV metadata)</h2>
          <p className="mb-4 text-sm text-netflix-light-gray">
            Get a free API key at{" "}
            <a
              href="https://thetvdb.com/api-information"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white underline"
            >
              thetvdb.com/api-information
            </a>
            . Used to scrape posters, descriptions, and genres for your Plex TV library.
          </p>
          <input
            type="password"
            value={form.tvdbApiKey}
            onChange={(e) => setForm({ ...form, tvdbApiKey: e.target.value })}
            placeholder="TVDB API key"
            className="mb-3 w-full rounded bg-[#333] px-4 py-3 focus:outline-none focus:ring-2 focus:ring-white/30"
          />
          <button
            type="button"
            onClick={testTvdb}
            className="text-sm text-netflix-light-gray hover:text-white"
          >
            Test TVDB connection
            {tvdbStatus === "checking" && "..."}
            {tvdbStatus === "ok" && <Check className="ml-1 inline h-4 w-4 text-green-400" />}
            {tvdbStatus === "error" && <X className="ml-1 inline h-4 w-4 text-red-400" />}
          </button>
        </section>

        <section className="rounded bg-netflix-dark p-6">
          <h2 className="mb-4 text-xl font-semibold">Video library folder</h2>
          <p className="mb-4 text-sm text-netflix-light-gray">
            Path inside the container. On unRAID, mount{" "}
            <code className="text-white">{HOST_VIDEO_PATH}</code> via{" "}
            <code className="text-white">-v /mnt/user/Media:/media:ro</code>, then use{" "}
            <code className="text-white">{CONTAINER_VIDEO_PATH}</code> here.
          </p>
          <input
            type="text"
            value={form.libraryPath}
            onChange={(e) => setForm({ ...form, libraryPath: e.target.value })}
            placeholder={CONTAINER_VIDEO_PATH}
            className="w-full rounded bg-[#333] px-4 py-3 focus:outline-none focus:ring-2 focus:ring-white/30"
          />
        </section>

        {!form.plexOnly && (
        <section className="rounded bg-netflix-dark p-6">
          <h2 className="mb-4 text-xl font-semibold">Real-Debrid + Torrentio</h2>
          <p className="mb-4 text-sm text-netflix-light-gray">
            When a title is not in Plex, Notflix searches torrent indexers via{" "}
            <a
              href="https://torrentio.strem.fun/configure"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white underline"
            >
              Torrentio
            </a>{" "}
            and plays cached streams from your Real-Debrid account. Configure Torrentio on their site,
            or just enter your Real-Debrid token here (uses default Torrentio settings).
          </p>
          <input
            type="password"
            value={form.realDebridToken}
            onChange={(e) => setForm({ ...form, realDebridToken: e.target.value })}
            placeholder="Real-Debrid API token"
            className="mb-3 w-full rounded bg-[#333] px-4 py-3 focus:outline-none focus:ring-2 focus:ring-white/30"
          />
          <button type="button" onClick={testDebrid} className="text-sm text-netflix-light-gray hover:text-white">
            Test Real-Debrid
            {debridStatus === "ok" && <Check className="ml-1 inline h-4 w-4 text-green-400" />}
            {debridStatus === "error" && <X className="ml-1 inline h-4 w-4 text-red-400" />}
          </button>
        </section>
        )}

        <section className="rounded bg-netflix-dark p-6">
          <h2 className="mb-4 text-xl font-semibold">Playback</h2>
          <p className="mb-4 text-sm text-netflix-light-gray">
            Direct play streams the original file with no server transcoding — fastest and best quality
            when your browser supports the codec (H.264 + AAC). Use transcode for HEVC, AC3/DTS audio, or
            subtitle/audio track selection on Real-Debrid.
          </p>
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={form.directPlay ?? true}
              onChange={(e) => setForm({ ...form, directPlay: e.target.checked })}
              className="h-4 w-4 rounded accent-netflix-red"
            />
            <span className="text-sm">Prefer direct play (skip transcoding)</span>
          </label>
        </section>

        {!form.plexOnly && (
        <section className="rounded bg-netflix-dark p-6">
          <h2 className="mb-4 text-xl font-semibold">TMDB (optional browse rows)</h2>
          <input
            type="password"
            value={form.tmdbApiKey}
            onChange={(e) => setForm({ ...form, tmdbApiKey: e.target.value })}
            placeholder="TMDB API key"
            className="w-full rounded bg-[#333] px-4 py-3 focus:outline-none focus:ring-2 focus:ring-white/30"
          />
        </section>
        )}

        <button
          type="button"
          onClick={saveAndSync}
          disabled={syncing}
          className="flex w-full items-center justify-center gap-2 rounded bg-netflix-red py-3 font-semibold hover:bg-netflix-red-hover disabled:opacity-50 md:w-auto md:px-12"
        >
          {syncing ? (
            <>
              <RefreshCw className="h-5 w-5 animate-spin" />
              Syncing library...
            </>
          ) : saved ? (
            "Saved!"
          ) : (
            "Save & Sync Library"
          )}
        </button>
        {syncResult && (
          <p className="text-sm text-netflix-light-gray">{syncResult}</p>
        )}
      </div>
    </div>
  );
}
