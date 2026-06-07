"use client";

import { useState, useCallback, useEffect } from "react";
import { Search as SearchIcon } from "lucide-react";
import { TitleCard } from "@/components/browse/TitleCard";
import type { MediaItem } from "@/lib/types";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const [catalogRes, libraryRes] = await Promise.all([
        fetch(`/api/catalog?type=search&q=${encodeURIComponent(q)}`),
        fetch("/api/library"),
      ]);
      const catalogData = catalogRes.ok ? await catalogRes.json() : { items: [] };
      const libraryData = libraryRes.ok ? await libraryRes.json() : { items: [] };

      const libraryFiltered = (libraryData.items ?? []).filter((item: MediaItem) =>
        item.title.toLowerCase().includes(q.toLowerCase())
      );

      setResults([...libraryFiltered, ...(catalogData.items ?? [])]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => search(query), 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  return (
    <div className="min-h-screen px-4 py-8 md:px-12 lg:px-16">
      <div className="relative mx-auto max-w-2xl">
        <SearchIcon className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-netflix-gray" />
        <input
          type="search"
          placeholder="Titles, people, genres"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          className="w-full rounded bg-[#333] py-4 pl-12 pr-4 text-lg text-white placeholder:text-netflix-gray focus:outline-none focus:ring-2 focus:ring-white/30"
        />
      </div>

      {loading && (
        <p className="mt-8 text-center text-netflix-light-gray">Searching...</p>
      )}

      {!loading && results.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-4 text-xl font-semibold">
            {results.length} result{results.length !== 1 ? "s" : ""} for &quot;{query}&quot;
          </h2>
          <div className="flex flex-wrap gap-3">
            {results.map((item) => (
              <TitleCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}

      {!loading && query && results.length === 0 && (
        <p className="mt-8 text-center text-netflix-light-gray">
          No results found. Try a different search or add content via Real-Debrid.
        </p>
      )}
    </div>
  );
}
