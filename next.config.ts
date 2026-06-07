import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    localPatterns: [
      {
        pathname: "/api/plex/art",
      },
      {
        pathname: "/api/debrid/hls/**",
      },
    ],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        pathname: "/t/p/**",
      },
      {
        protocol: "https",
        hostname: "artworks.thetvdb.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "www.thetvdb.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
