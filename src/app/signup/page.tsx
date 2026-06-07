"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sign up failed");
      router.push("/profiles");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
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
      <header className="relative z-10 px-4 py-5 md:px-12">
        <Link href="/" className="text-netflix-red text-3xl font-bold md:text-4xl">
          NETFLIX
        </Link>
      </header>

      <main className="relative z-10 mx-auto mt-8 w-full max-w-md px-4 md:mt-16">
        <div className="rounded bg-black/75 px-6 py-12 md:px-16 md:py-16">
          <h1 className="mb-6 text-2xl font-semibold md:text-3xl">Sign Up</h1>
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="username"
              className="w-full rounded bg-[#333] px-4 py-3 text-white placeholder:text-netflix-gray focus:outline-none focus:ring-2 focus:ring-white/50"
              required
              minLength={2}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full rounded bg-[#333] px-4 py-3 text-white placeholder:text-netflix-gray focus:outline-none focus:ring-2 focus:ring-white/50"
              required
              minLength={4}
            />
            <input
              type="password"
              placeholder="Confirm password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className="w-full rounded bg-[#333] px-4 py-3 text-white placeholder:text-netflix-gray focus:outline-none focus:ring-2 focus:ring-white/50"
              required
              minLength={4}
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded bg-netflix-red py-3 font-semibold transition hover:bg-netflix-red-hover disabled:opacity-70"
            >
              {loading ? "Creating account..." : "Sign Up"}
            </button>
          </form>
          <p className="mt-6 text-sm text-netflix-light-gray">
            No email verification. If you forget your password, contact your admin to reset it.
          </p>
          <p className="mt-8 text-netflix-light-gray">
            Already have an account?{" "}
            <Link href="/" className="text-white hover:underline">
              Sign in
            </Link>
            .
          </p>
        </div>
      </main>
    </div>
  );
}
