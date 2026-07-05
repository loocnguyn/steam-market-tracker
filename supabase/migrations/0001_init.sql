-- Steam Market Tracker — initial schema
-- Run in Supabase SQL editor or via `supabase db push`.

-- Items shared across all users (also caches the scraped item_nameid).
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  appid int not null,
  market_hash_name text not null,
  item_nameid text,
  display_name text,
  icon_url text,
  created_at timestamptz not null default now(),
  unique (appid, market_hash_name)
);

-- Per-user watchlist.
create table if not exists public.watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, item_id)
);

-- Price/order snapshots over time (feeds charts + serves as cache).
create table if not exists public.price_snapshots (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  lowest_sell numeric,
  highest_buy numeric,
  volume int,
  captured_at timestamptz not null default now()
);

create index if not exists idx_snapshots_item_time
  on public.price_snapshots (item_id, captured_at desc);

-- Row Level Security ------------------------------------------------------
alter table public.items enable row level security;
alter table public.watchlist enable row level security;
alter table public.price_snapshots enable row level security;

-- Items + snapshots are readable by any authenticated user.
create policy "items readable" on public.items
  for select using (true);
create policy "items insertable by authed" on public.items
  for insert to authenticated with check (true);

create policy "snapshots readable" on public.price_snapshots
  for select using (true);

-- Watchlist is private to its owner.
create policy "own watchlist select" on public.watchlist
  for select using (auth.uid() = user_id);
create policy "own watchlist insert" on public.watchlist
  for insert with check (auth.uid() = user_id);
create policy "own watchlist delete" on public.watchlist
  for delete using (auth.uid() = user_id);

-- Realtime: broadcast snapshot inserts so the UI can update live.
alter publication supabase_realtime add table public.price_snapshots;
