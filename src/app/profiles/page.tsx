"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";

const AVATARS = ["👤", "👩", "👨", "🧒", "🦸", "🎬", "🎮", "🎵", "🐱", "🐶"];

export default function ProfilesPage() {
  const router = useRouter();
  const profiles = useAppStore((s) => s.profiles);
  const setUser = useAppStore((s) => s.setUser);
  const hydrateUserState = useAppStore((s) => s.hydrateUserState);
  const setActiveProfile = useAppStore((s) => s.setActiveProfile);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAvatar, setNewAvatar] = useState("👤");
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/auth/me", { credentials: "same-origin" });
        if (!res.ok) {
          router.replace("/");
          return;
        }
        const data = await res.json();
        setUser(data.user);
        hydrateUserState(data.state);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router, setUser, hydrateUserState]);

  const selectProfile = (id: string) => {
    setActiveProfile(id);
    router.push("/browse");
  };

  const handleAddProfile = async () => {
    if (!newName.trim()) return;
    setError("");
    try {
      const res = await fetch("/api/user/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          action: "addProfile",
          name: newName.trim(),
          avatar: newAvatar,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.error ||
            (res.status === 401
              ? "Session expired — sign in again."
              : "Failed to add profile")
        );
      }
      hydrateUserState(data.state);
      setAdding(false);
      setNewName("");
      setNewAvatar("👤");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add profile");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/30 border-t-white" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <h1 className="mb-8 text-3xl font-normal md:mb-12 md:text-5xl">Who&apos;s watching?</h1>
      <div className="flex flex-wrap justify-center gap-4 md:gap-8">
        {profiles.map((profile) => (
          <button
            key={profile.id}
            type="button"
            onClick={() => selectProfile(profile.id)}
            className="group flex flex-col items-center gap-2 md:gap-3"
          >
            <div className="flex h-20 w-20 items-center justify-center rounded bg-netflix-red text-4xl transition group-hover:ring-4 group-hover:ring-white md:h-32 md:w-32 md:text-6xl">
              {profile.avatar}
            </div>
            <span className="max-w-[120px] truncate text-sm text-netflix-light-gray transition group-hover:text-white md:text-lg">
              {profile.name}
            </span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="group flex flex-col items-center gap-2 md:gap-3"
        >
          <div className="flex h-20 w-20 items-center justify-center rounded bg-netflix-dark text-4xl text-netflix-gray transition group-hover:ring-4 group-hover:ring-white md:h-32 md:w-32 md:text-6xl">
            +
          </div>
          <span className="text-sm text-netflix-light-gray md:text-lg">Add Profile</span>
        </button>
      </div>

      {adding && (
        <div className="mt-10 w-full max-w-sm rounded bg-netflix-dark p-6">
          <h2 className="mb-4 text-lg font-semibold">Add Profile</h2>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Profile name"
            className="mb-3 w-full rounded bg-[#333] px-4 py-3 focus:outline-none focus:ring-2 focus:ring-white/30"
          />
          <div className="mb-4 flex flex-wrap gap-2">
            {AVATARS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setNewAvatar(a)}
                className={`rounded p-2 text-2xl ${newAvatar === a ? "ring-2 ring-white" : "opacity-70"}`}
              >
                {a}
              </button>
            ))}
          </div>
          {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAddProfile}
              className="flex-1 rounded bg-netflix-red py-2 font-semibold"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="flex-1 rounded border border-white/30 py-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
