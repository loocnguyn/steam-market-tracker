"use client";

import type { SteamUser } from "@/lib/useAuth";

interface Props {
  user: SteamUser | null;
  loading: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}

export function AuthButton({ user, loading, onSignIn, onSignOut }: Props) {
  if (loading) {
    return <div className="h-9 w-32 animate-pulse rounded-lg bg-zinc-800/50" />;
  }

  if (!user) {
    return (
      <button
        onClick={onSignIn}
        className="flex items-center gap-2 rounded-lg bg-[#171a21] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2a3f5f] border border-white/[0.08]"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12c0 4.84 3.44 8.87 8 9.8v-6.93H7.9v-2.87H10V9.41c0-2.07 1.23-3.21 3.11-3.21.9 0 1.84.16 1.84.16v2.02h-1.04c-1.02 0-1.34.63-1.34 1.28v1.53h2.28l-.36 2.87h-1.92V21.8c4.56-.93 8-4.96 8-9.8 0-5.52-4.48-10-10-10z" />
        </svg>
        Sign in through Steam
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {user.avatarUrl && (
        <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-md" />
      )}
      <span className="hidden text-sm text-zinc-300 sm:inline">
        {user.personaName ?? user.steamid}
      </span>
      <button
        onClick={onSignOut}
        className="rounded-lg border border-white/[0.08] px-3 py-2 text-xs text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-zinc-200"
      >
        Sign out
      </button>
    </div>
  );
}
