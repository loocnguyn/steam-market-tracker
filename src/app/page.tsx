"use client";

import { ItemSearch } from "@/components/ItemSearch";
import { OrderBookCard } from "@/components/OrderBookCard";
import { useWatchlist } from "@/lib/useWatchlist";

export default function Home() {
  const { items, loaded, add, remove } = useWatchlist();

  return (
    <main className="relative min-h-full flex-1">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(16,185,129,0.12),transparent)]"
      />

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-14">
        <header className="flex flex-col items-center gap-3 text-center">
          <div className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-xs text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Live order books, updated every few seconds
          </div>
          <h1 className="bg-gradient-to-b from-zinc-50 to-zinc-400 bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-5xl">
            Steam Market Tracker
          </h1>
          <p className="max-w-xl text-sm text-zinc-500 sm:text-base">
            Search any Steam Market item, add it to your watchlist, and
            track live buy/sell order books and price history — all in one
            place.
          </p>
        </header>

        <div className="flex justify-center">
          <ItemSearch onAdd={add} />
        </div>

        {loaded && items.length === 0 && (
          <div className="mx-auto flex max-w-md flex-col items-center gap-2 rounded-2xl border border-dashed border-white/[0.08] px-8 py-12 text-center">
            <p className="text-sm text-zinc-400">Your watchlist is empty</p>
            <p className="text-xs text-zinc-600">
              Search for an item above and click &ldquo;+ Add&rdquo; to start
              tracking it.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <OrderBookCard
              key={`${item.appid}:${item.marketHashName}`}
              appid={item.appid}
              marketHashName={item.marketHashName}
              onRemove={remove}
              initialIconUrl={item.iconUrl}
              initialType={item.type}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
