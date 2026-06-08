"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Check, X, RefreshCw } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { syncSettingsToServer, fetchWithSettings } from "@/lib/client-settings";
import { CONTAINER_MEDIA_PATH, CONTAINER_VIDEO_PATH, HOST_MEDIA_PATH, mapHostPathToContainer } from "@/lib/library-path";
import { isPlexUnauthorizedMessage } from "@/lib/plex-auth-client";
import { LibrarySyncBar, type LibrarySyncStatus } from "@/components/browse/LibrarySyncBar";
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
  const [plexUrlPinned, setPlexUrlPinned] = useState(false);
  const plexPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const plexPollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const plexPollCompleteRef = useRef(false);

  useEffect(() => {
    return () => {
      if (plexPollRef.current) clearInterval(plexPollRef.current);
      if (plexPollTimeoutRef.current) clearTimeout(plexPollTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  useEffect(() => {
    let cancelled = false;

    async function loadServerConfig() {
      const res = await fetch("/api/settings/sync?config=1", { credentials: "same-origin" }).catch(
        () => null
      );
      if (cancelled || !res?.ok) return;
      const data = await res.json();
      if (data.settings) {
        setPlexUrlPinned(Boolean(data.plexUrlPinned));
        updateSettings(data.settings);
        setForm((prev) => ({ ...prev, ...data.settings }));
      }
    }

    void loadServerConfig();
    return () => {
      cancelled = true;
    };
  }, [updateSettings]);

  useEffect(() => {
    let cancelled = false;

    async function refreshSyncStatus() {
      const res = await fetch("/api/library/sync").catch(() => null);
      if (cancelled || !res?.ok) return;
      const data = (await res.json()) as LibrarySyncStatus;
      if (
        data.running ||
        data.status === "running" ||
        data.status === "error" ||
        (data.percent !== undefined && data.percent > 0 && data.percent < 100)
      ) {
        setSyncProgress(data);
      } else if (data.status === "done" && data.message) {
        setSyncProgress(data);
      }
    }

    void refreshSyncStatus();
    const id = window.setInterval(refreshSyncStatus, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const [syncProgress, setSyncProgress] = useState<LibrarySyncStatus | null>(null);

  async function pollLibrarySyncUntilDone(): Promise<LibrarySyncStatus | null> {
    for (let i = 0; i < 120; i++) {
      const res = await fetch("/api/library/sync").catch(() => null);
      if (!res?.ok) break;
      const data = (await res.json()) as LibrarySyncStatus;
      setSyncProgress(data);
      const running = data.running || data.status === "running";
      if (!running) return data;
      await new Promise((r) => setTimeout(r, 1500));
    }
    return null;
  }

  const saveAndSync = async () => {
    const normalizedForm = {
      ...form,
      libraryPath: form.libraryPath ? mapHostPathToContainer(form.libraryPath) : form.libraryPath,
    };
    updateSettings(normalizedForm);
    setForm(normalizedForm);
    setSyncing(true);
    setSyncResult("");
    setSyncProgress(null);
    try {
      await syncSettingsToServer(normalizedForm);
      const configRes = await fetch("/api/settings/sync?config=1", { credentials: "same-origin" });
      if (configRes.ok) {
        const configData = await configRes.json();
        if (configData.settings) {
          updateSettings(configData.settings);
          setForm(configData.settings);
        }
      }

      const syncStart = await fetchWithSettings("/api/library/sync?force=1", normalizedForm, {
        method: "POST",
      });
      const syncData = syncStart.ok ? await syncStart.json() : null;
      if (syncData?.sync) setSyncProgress(syncData.sync);

      await pollLibrarySyncUntilDone();

      const libRes = await fetchWithSettings("/api/library", normalizedForm);
      const libData = libRes.ok ? await libRes.json() : null;
      if (!libRes.ok) {
        const err = libData?.error || `Library sync failed (${libRes.status})`;
        setSyncResult(`Settings saved, but library sync failed: ${err}`);
        return;
      }
      setSaved(true);
      if (libData?.count) {
        setSyncResult(
          `Synced! Saved ${libData.count} titles from ${libData.source} to the library database.`
        );
      } else if (libData?.message) {
        setSyncResult(libData.message);
      } else {
        setSyncResult("Settings saved. Configure Plex or library path to load media.");
      }
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setSyncResult(err instanceof Error ? err.message : "Failed to sync settings.");
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
      plexUrl: plexUrlPinned ? form.plexUrl : auth.plexUrl || form.plexUrl,
    };
    setForm(nextForm);
    updateSettings(nextForm);
    setPlexNeedsSignIn(false);
    setPlexStatus("ok");
    setPlexServer(auth.serverName ? `Signed in — ${auth.serverName}` : "Signed in to Plex");
    await syncSettingsToServer(nextForm);
    const libRes = await fetchWithSettings("/api/library?refresh=1", nextForm);
    if (libRes.ok) {
      const libData = await libRes.json();
      setSyncResult(
        libData.count
          ? `Signed in. Cached ${libData.count} titles from ${libData.source}.`
          : "Signed in to Plex. Library sync complete."
      );
    } else {
      setSyncResult("Signed in to Plex. Open Settings and Save & Sync if the library is empty.");
    }
  };

  const signInWithPlex = async () => {
    stopPlexPoll();
    plexPollCompleteRef.current = false;
    setPlexSigningIn(true);
    setPlexServer("");
    setPlexNeedsSignIn(false);
    try {
      const res = await fetch("/api/plex/auth/pin", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start Plex sign-in");

      window.open(data.authUrl, "plex-auth", "width=520,height=720");

      plexPollRef.current = setInterval(async () => {
        if (plexPollCompleteRef.current) return;
        try {
          const pollRes = await fetch(
            `/api/plex/auth/pin?pinId=${encodeURIComponent(data.pinId)}&clientId=${encodeURIComponent(data.clientId)}`
          );
          const pollData = await pollRes.json();

          if (pollRes.status === 410 || pollData.status === "expired") {
            if (plexPollCompleteRef.current) return;
            stopPlexPoll();
            setPlexStatus("error");
            setPlexServer("Plex sign-in expired. Click Sign in with Plex again.");
            return;
          }

          if (!pollRes.ok) throw new Error(pollData.error || "Plex sign-in failed");
          if (pollData.status !== "authorized") return;

          plexPollCompleteRef.current = true;
          stopPlexPoll();
          await applyPlexAuth(pollData);
        } catch (err) {
          if (plexPollCompleteRef.current) return;
          stopPlexPoll();
          setPlexStatus("error");
          setPlexServer(err instanceof Error ? err.message : "Plex sign-in failed");
        }
      }, 2000);

      plexPollTimeoutRef.current = setTimeout(() => {
        if (plexPollCompleteRef.current) return;
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
      await syncSettingsToServer(form);
      const res = await fetch("/api/settings/sync?test=plex", { credentials: "same-origin" });
      const data = await res.json();
      if (data.ok) {
        setPlexStatus("ok");
        setPlexServer(
          data.serverName
            ? `${data.serverName} · ${data.plexUrl ?? form.plexUrl}`
            : `Connected · ${data.plexUrl ?? form.plexUrl}`
        );
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

  const formatLibraryDiagnostic = (data: {
    message?: string;
    error?: string;
    hint?: string;
    suggestions?: string[];
    availableSubdirs?: string[];
  }) => {
    const parts = [data.message ?? data.error ?? ""];
    if (data.hint) parts.push(data.hint);
    if (data.suggestions?.length) parts.push(`Existing paths: ${data.suggestions.join(", ")}`);
    if (data.availableSubdirs?.length) {
      parts.push(`Folders under /media: ${data.availableSubdirs.join(", ")}`);
    }
    return parts.filter(Boolean).join(" · ");
  };

  const testLibraryPath = async () => {
    setLibraryStatus("checking");
    setLibraryMessage("");
    try {
      const res = await fetchWithSettings("/api/settings/diagnostics?action=library", form);
      const data = await res.json();
      setLibraryStatus(data.ok ? "ok" : "error");
      setLibraryMessage(formatLibraryDiagnostic(data));
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
      setLibraryMessage(formatLibraryDiagnostic(data));
    } catch {
      setLibraryStatus("error");
      setLibraryMessage("Video folder test failed");
    }
  };

  const testPlexDiagnostics = async () => {
    if (!form.plexToken) return;
    setPlexStatus("checking");
    setPlexServer("");
    setPlexNeedsSignIn(false);
    try {
      await syncSettingsToServer(form);
      const res = await fetch("/api/settings/diagnostics?action=plex", {
        credentials: "same-origin",
      });
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

  useEffect(() => {
    if (!form.plexToken) return;

    let cancelled = false;

    async function verifyPlexConnection() {
      try {
        const res = await fetch("/api/settings/sync?test=plex", { credentials: "same-origin" });
        if (cancelled || !res.ok) return;
        const data = await res.json();
        if (data.ok) {
          setPlexStatus("ok");
          setPlexServer(
            data.serverName
              ? `${data.serverName} · ${data.plexUrl ?? form.plexUrl}`
              : `Connected · ${data.plexUrl ?? form.plexUrl}`
          );
          setPlexNeedsSignIn(false);
        } else {
          setPlexStatus("error");
          setPlexServer(data.error ?? "Plex disconnected");
          setPlexNeedsSignIn(isPlexUnauthorizedMessage(data.error));
        }
      } catch {
        if (!cancelled) setPlexStatus("error");
      }
    }

    void verifyPlexConnection();
    const id = window.setInterval(verifyPlexConnection, 90_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [form.plexToken, form.plexUrl]);

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
            Mount host share <code className="text-white">{HOST_MEDIA_PATH}</code> to{" "}
            <code className="text-white">{CONTAINER_MEDIA_PATH}</code> in Docker (
            <code className="text-white">-v /mnt/user/Media:/media:ro</code>).
            Use a path inside the container here — usually{" "}
            <code className="text-white">{CONTAINER_VIDEO_PATH}</code> or{" "}
            <code className="text-white">{CONTAINER_MEDIA_PATH}</code>.
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
          {plexUrlPinned && form.plexUrl && (
            <p className="mb-2 text-xs text-netflix-gray">
              Locked to <code className="text-white">{form.plexUrl}</code> from server{" "}
              <code className="text-white">PLEX_URL</code> (.env / compose). Sign-in only updates
              your token.
            </p>
          )}
          <input
            type="text"
            value={form.plexUrl}
            onChange={(e) => setForm({ ...form, plexUrl: e.target.value })}
            readOnly={plexUrlPinned}
            placeholder="http://172.16.0.10:32400"
            className="mb-4 w-full rounded bg-[#333] px-4 py-3 focus:outline-none focus:ring-2 focus:ring-white/30 disabled:opacity-80"
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
            <code className="text-white">{HOST_MEDIA_PATH}</code> to{" "}
            <code className="text-white">{CONTAINER_MEDIA_PATH}</code> via{" "}
            <code className="text-white">-v /mnt/user/Media:/media:ro</code>, then use{" "}
            <code className="text-white">{CONTAINER_VIDEO_PATH}</code> or{" "}
            <code className="text-white">{CONTAINER_MEDIA_PATH}</code> here.
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
          <h2 className="mb-4 text-xl font-semibold">Real-Debrid, Torrentio & Peerflix</h2>
          <p className="mb-4 text-sm text-netflix-light-gray">
            When a title is not in Plex, Notflix searches English torrents via{" "}
            <a
              href="https://torrentio.strem.fun/configure"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white underline"
            >
              Torrentio
            </a>{" "}
            and{" "}
            <a
              href="https://config.peerflix.mov"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white underline"
            >
              Peerflix
            </a>
            , then plays cached streams from Real-Debrid when configured. Non-English releases are
            filtered out automatically.
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
            on CPU-only servers. Works when the file is <strong className="text-white">H.264 video + AAC
            or MP3 audio</strong> (typical MP4/MKV). Surround tracks (AC3/DTS), XviD/AVI, or subtitles
            require ffmpeg on the server; set <code className="text-white">HERO_VIDEO=false</code> in{" "}
            <code className="text-white">.env</code> to skip hero marquee transcoding and use the backdrop
            photo only. When Plex is connected, playback goes through Plex first (use Plex transcode there
            for legacy formats instead of loading this container&apos;s CPU).
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

        <section className="rounded bg-netflix-dark p-6">
          <h2 className="mb-4 text-xl font-semibold">Library sync</h2>
          <p className="mb-4 text-sm text-netflix-light-gray">
            Plex library sync runs in the background. If Plex is unreachable, Notflix falls back to
            scanning your mounted video folder. Progress appears below while syncing.
          </p>
          <LibrarySyncBar sync={syncProgress} className="rounded border border-white/10" />
        </section>

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
