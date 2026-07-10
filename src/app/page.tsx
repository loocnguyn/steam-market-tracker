"use client";

import { AddItemForm } from "@/components/AddItemForm";
import { OrderBookCard } from "@/components/OrderBookCard";
import { useWatchlist } from "@/lib/useWatchlist";

export default function Home() {
  const { items, loaded, add, remove } = useWatchlist();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-zinc-50">
          Steam Market Tracker
        </h1>
        <p className="text-sm text-zinc-500">
          Track live buy/sell order books for multiple Steam Market items at once.
        </p>
      </header>

      <AddItemForm onAdd={add} />

      {loaded && items.length === 0 && (
        <p className="text-sm text-zinc-500">
          No items yet. Paste a Steam Market listing link above to get started.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <OrderBookCard key={item.url} url={item.url} onRemove={remove} />
        ))}
      </div>
    </main>
  );
}
