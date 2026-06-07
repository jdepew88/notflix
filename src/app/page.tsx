"use client";

import { useState } from "react";
import Link from "next/link";
import { useAppStore } from "@/lib/store";
import { completeClientAuth } from "@/lib/auth-client";

export default function LoginPage() {
  const setUser = useAppStore((s) => s.setUser);
  const hydrateUserState = useAppStore((s) => s.hydrateUserState);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sign in failed");
      const next = new URLSearchParams(window.location.search).get("next");
      const redirectTo = next && next.startsWith("/") ? next : "/profiles";
      await completeClientAuth(data.user, setUser, hydrateUserState, redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url('https://image.tmdb.org/t/p/original/9BBTo63ANSmhC4e6r62OJFuK2GL.jpg')",
        }}
      />
      <div className="netflix-gradient-top absolute inset-x-0 top-0 h-32" />

      <header className="relative z-10 flex items-center justify-between px-4 py-5 md:px-12">
        <span className="text-netflix-red text-3xl font-bold md:text-4xl">NETFLIX</span>
        <Link href="/settings" className="text-sm text-netflix-light-gray hover:text-white">
          Settings
        </Link>
      </header>

      <main className="relative z-10 mx-auto mt-8 w-full max-w-md px-4 md:mt-16">
        <div className="rounded bg-black/75 px-6 py-12 md:px-16 md:py-16">
          <h1 className="mb-6 text-2xl font-semibold md:text-3xl">Sign In</h1>
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="username"
              className="w-full rounded bg-[#333] px-4 py-3 text-white placeholder:text-netflix-gray focus:outline-none focus:ring-2 focus:ring-white/50"
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded bg-[#333] px-4 py-3 text-white placeholder:text-netflix-gray focus:outline-none focus:ring-2 focus:ring-white/50"
              required
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded bg-netflix-red py-3 font-semibold transition hover:bg-netflix-red-hover disabled:opacity-70"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
          <p className="mt-6 text-sm text-netflix-light-gray">
            Forgot your password? Contact your admin to reset it.
          </p>
          <p className="mt-8 text-netflix-light-gray">
            New to Netflix?{" "}
            <Link href="/signup" className="text-white hover:underline">
              Sign up now
            </Link>
            .
          </p>
        </div>
      </main>
    </div>
  );
}
