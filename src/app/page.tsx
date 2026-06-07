"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => router.push("/profiles"), 600);
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

      <header className="relative z-10 px-4 py-5 md:px-12">
        <span className="text-netflix-red text-3xl font-bold md:text-4xl">NETFLIX</span>
      </header>

      <main className="relative z-10 mx-auto mt-8 w-full max-w-md px-4 md:mt-16">
        <div className="rounded bg-black/75 px-6 py-12 md:px-16 md:py-16">
          <h1 className="mb-6 text-2xl font-semibold md:text-3xl">Sign In</h1>
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              placeholder="Email or phone number"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded bg-[#333] px-4 py-3 text-white placeholder:text-netflix-gray focus:outline-none focus:ring-2 focus:ring-white/50"
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded bg-[#333] px-4 py-3 text-white placeholder:text-netflix-gray focus:outline-none focus:ring-2 focus:ring-white/50"
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded bg-netflix-red py-3 font-semibold transition hover:bg-netflix-red-hover disabled:opacity-70"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
          <div className="mt-4 flex items-center justify-between text-sm text-netflix-light-gray">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="rounded" />
              Remember me
            </label>
            <a href="#" className="hover:underline">Need help?</a>
          </div>
          <p className="mt-12 text-netflix-light-gray">
            New to Netflix?{" "}
            <a href="#" className="text-white hover:underline">
              Sign up now
            </a>
            .
          </p>
        </div>
      </main>
    </div>
  );
}
