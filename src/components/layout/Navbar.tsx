"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Search, Bell, ChevronDown, Settings } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/cn";

const GENRE_LINKS = [
  "Action",
  "Adventure",
  "Animation",
  "Comedy",
  "Crime",
  "Documentary",
  "Drama",
  "Fantasy",
  "Horror",
  "Romance",
  "Sci-Fi",
  "Thriller",
];

export function Navbar() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [genreOpen, setGenreOpen] = useState(false);
  const activeProfileId = useAppStore((s) => s.activeProfileId);
  const profiles = useAppStore((s) => s.profiles);
  const settings = useAppStore((s) => s.settings);
  const logoutLocal = useAppStore((s) => s.logoutLocal);
  const activeProfile = profiles.find((p) => p.id === activeProfileId);

  const navLinks = [
    { href: "/browse", label: "Home" },
    { href: "/browse/search", label: "Search" },
    { href: "/browse/my-list", label: "My List" },
    ...(settings.plexOnly ? [] : [{ href: "/browse/debrid", label: "Debrid" }]),
  ];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleSignOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    logoutLocal();
    window.location.href = "/";
  };

  return (
    <nav
      className={cn(
        "fixed top-0 z-50 w-full transition-colors duration-300",
        scrolled ? "bg-netflix-black" : "bg-gradient-to-b from-black/80 to-transparent"
      )}
    >
      <div className="mx-auto flex h-16 items-center justify-between px-4 md:h-[68px] md:px-12 lg:px-16">
        <div className="flex items-center gap-6 md:gap-8">
          <Link
            href="/browse"
            className="text-netflix-red text-2xl font-extrabold tracking-tighter md:text-3xl"
            style={{ fontFamily: "Helvetica Neue, Arial, sans-serif" }}
          >
            NETFLIX
          </Link>
          <ul className="hidden items-center gap-4 md:flex lg:gap-5">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={cn(
                    "text-sm transition hover:text-netflix-light-gray",
                    pathname === link.href ? "font-semibold text-white" : "text-netflix-light-gray"
                  )}
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li className="relative">
              <button
                type="button"
                onMouseEnter={() => setGenreOpen(true)}
                onMouseLeave={() => setGenreOpen(false)}
                className="flex items-center gap-1 text-sm text-netflix-light-gray transition hover:text-white"
              >
                Browse
                <ChevronDown className="h-3 w-3" />
              </button>
              {genreOpen && (
                <div
                  onMouseEnter={() => setGenreOpen(true)}
                  onMouseLeave={() => setGenreOpen(false)}
                  className="absolute left-0 top-full mt-0 w-48 border border-white/10 bg-black/95 py-2 shadow-xl"
                >
                  {GENRE_LINKS.map((name) => (
                    <Link
                      key={name}
                      href={`/browse/genre?name=${encodeURIComponent(name)}`}
                      className="block px-4 py-2 text-sm hover:underline"
                    >
                      {name}
                    </Link>
                  ))}
                </div>
              )}
            </li>
          </ul>
        </div>

        <div className="flex items-center gap-4 md:gap-5">
          <Link href="/browse/search" className="text-white hover:text-netflix-light-gray">
            <Search className="h-5 w-5" />
          </Link>
          <button type="button" className="hidden text-white hover:text-netflix-light-gray sm:block">
            <Bell className="h-5 w-5" />
          </button>
          <Link href="/settings" className="hidden text-white hover:text-netflix-light-gray md:block">
            <Settings className="h-5 w-5" />
          </Link>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded bg-netflix-red text-sm">
                {activeProfile?.avatar ?? "👤"}
              </span>
              <ChevronDown className={cn("h-4 w-4 transition", menuOpen && "rotate-180")} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 border border-white/10 bg-black/95 py-2 shadow-xl">
                <Link
                  href="/profiles"
                  className="block px-4 py-2 text-sm hover:underline"
                  onClick={() => setMenuOpen(false)}
                >
                  Switch Profiles
                </Link>
                <Link
                  href="/settings"
                  className="block px-4 py-2 text-sm hover:underline md:hidden"
                  onClick={() => setMenuOpen(false)}
                >
                  Settings
                </Link>
                <button
                  type="button"
                  className="block w-full px-4 py-2 text-left text-sm hover:underline"
                  onClick={() => {
                    setMenuOpen(false);
                    void handleSignOut();
                  }}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto px-4 pb-2 md:hidden row-scroll">
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "whitespace-nowrap text-sm",
              pathname === link.href ? "font-semibold text-white" : "text-netflix-light-gray"
            )}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
