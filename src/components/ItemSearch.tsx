"use client";

import { useEffect, useRef, useState } from "react";
import type { SearchResult } from "@/lib/steam/steam";
import { parseMarketUrl } from "@/lib/steam/steam";

interface Props {
  onAdd: (
    appid: number,
    marketHashName: string,
    extra?: { iconUrl?: string | null; type?: string | null },
  ) => void;
}

async function searchSteam(query: string): Promise<SearchResult[]> {
  const res = await fetch(`/api/steam/search?q=${encodeURIComponent(query)}`);
  const data = await res.json();
  if (!res.ok) {
    // Surface the real error (e.g. Steam rate limit) instead of silently
    // returning [] — that made rate-limiting look like "item doesn't exist".
    throw new Error(data.error ?? "Search failed");
  }
  return data.results ?? [];
}

export function ItemSearch({ onAdd }: Props) {
  const [mode, setMode] = useState<"search" | "link">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkValue, setLinkValue] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mode !== "search") return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    const timer = setTimeout(async () => {
      try {
        const r = await searchSteam(trimmed);
        setResults(r);
        setOpen(true);
      } catch (err) {
        setError((err as Error).message || "Search failed. Try again.");
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [query, mode]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function handleAdd(r: SearchResult) {
    onAdd(r.appid, r.marketHashName, { iconUrl: r.iconUrl, type: r.type });
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  function handleAddLink(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseMarketUrl(linkValue);
    if (!parsed) {
      setLinkError("That doesn't look like a Steam Market listing link.");
      return;
    }
    setLinkError(null);
    // No icon/type yet for link-pasted items — the order-book fetch fills
    // that in server-side (and caches it) on first load.
    onAdd(parsed.appid, parsed.marketHashName);
    setLinkValue("");
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-2xl">
      <div className="mb-2 flex justify-center gap-1 text-xs">
        <button
          onClick={() => setMode("search")}
          className={`rounded-full px-3 py-1 transition-colors ${
            mode === "search"
              ? "bg-emerald-500/15 text-emerald-400"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Search by name
        </button>
        <button
          onClick={() => setMode("link")}
          className={`rounded-full px-3 py-1 transition-colors ${
            mode === "link"
              ? "bg-emerald-500/15 text-emerald-400"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Paste a link
        </button>
      </div>

      {mode === "search" ? (
        <>
          <div className="relative">
            <svg
              viewBox="0 0 20 20"
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
              fill="none"
            >
              <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M14 14L18 18"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => results.length > 0 && setOpen(true)}
              placeholder="Search any Steam Market item (e.g. AK-47, Mann Co. Key)…"
              className="w-full rounded-xl border border-white/[0.08] bg-zinc-900/80 py-3 pl-10 pr-4 text-sm text-zinc-100 placeholder:text-zinc-600 shadow-lg shadow-black/10 backdrop-blur transition-colors focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            {loading && (
              <div className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-400" />
            )}
          </div>

          {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}

          {open && results.length > 0 && (
            <div className="absolute z-10 mt-2 w-full overflow-hidden rounded-xl border border-white/[0.08] bg-zinc-900/95 shadow-2xl shadow-black/40 backdrop-blur-xl">
              <ul className="max-h-96 overflow-y-auto py-1">
                {results.map((r) => (
                  <li key={`${r.appid}:${r.marketHashName}`}>
                    <button
                      onClick={() => handleAdd(r)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/[0.06] bg-zinc-950/60">
                        {r.iconUrl ? (
                          <img
                            src={r.iconUrl}
                            alt={r.name}
                            className="h-full w-full object-contain p-0.5"
                          />
                        ) : (
                          <div className="h-4 w-4 rounded bg-zinc-800" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-zinc-100">{r.name}</p>
                        <p className="truncate text-xs text-zinc-500">
                          {r.appName}
                          {r.type ? ` · ${r.type}` : ""}
                        </p>
                      </div>
                      {r.sellPriceText && (
                        <span className="shrink-0 text-xs text-zinc-500">
                          {r.sellPriceText}
                        </span>
                      )}
                      <span className="shrink-0 rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-400">
                        + Add
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {open &&
            !loading &&
            !error &&
            query.trim().length >= 2 &&
            results.length === 0 && (
              <div className="absolute z-10 mt-2 w-full rounded-xl border border-white/[0.08] bg-zinc-900/95 px-4 py-3 text-sm text-zinc-500 shadow-2xl backdrop-blur-xl">
                No items found for &ldquo;{query}&rdquo;.
              </div>
            )}
        </>
      ) : (
        <form onSubmit={handleAddLink} className="flex gap-2">
          <input
            value={linkValue}
            onChange={(e) => setLinkValue(e.target.value)}
            placeholder="https://steamcommunity.com/market/listings/730/..."
            className="flex-1 rounded-xl border border-white/[0.08] bg-zinc-900/80 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 shadow-lg shadow-black/10 backdrop-blur transition-colors focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
          <button
            type="submit"
            className="shrink-0 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
          >
            + Add
          </button>
          {linkError && (
            <p className="absolute -bottom-6 left-0 text-xs text-red-400">
              {linkError}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
