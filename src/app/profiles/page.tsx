"use client";

import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";

export default function ProfilesPage() {
  const router = useRouter();
  const profiles = useAppStore((s) => s.profiles);
  const setActiveProfile = useAppStore((s) => s.setActiveProfile);

  const selectProfile = (id: string) => {
    setActiveProfile(id);
    router.push("/browse");
  };

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
            <span className="text-sm text-netflix-light-gray transition group-hover:text-white md:text-lg">
              {profile.name}
            </span>
          </button>
        ))}
        <button type="button" className="group flex flex-col items-center gap-2 md:gap-3">
          <div className="flex h-20 w-20 items-center justify-center rounded bg-netflix-dark text-4xl text-netflix-gray transition group-hover:ring-4 group-hover:ring-white md:h-32 md:w-32 md:text-6xl">
            +
          </div>
          <span className="text-sm text-netflix-light-gray md:text-lg">Add Profile</span>
        </button>
      </div>
      <button
        type="button"
        className="mt-12 border border-netflix-gray px-6 py-2 text-netflix-gray transition hover:border-white hover:text-white md:mt-16"
      >
        Manage Profiles
      </button>
    </div>
  );
}
