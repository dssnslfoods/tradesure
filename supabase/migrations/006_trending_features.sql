-- Watchlist (per user) + Top-3 trending snapshot for change detection.

create table if not exists public.watchlist_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.auth_users(id) on delete cascade,
  base        text not null,                -- e.g. "BTC"
  symbol      text not null,                -- e.g. "BTCUSDT"
  notes       text,
  created_at  timestamptz not null default now(),
  unique (user_id, symbol)
);

create index if not exists watchlist_items_user_idx on public.watchlist_items (user_id);

alter table public.watchlist_items enable row level security;

-- Generic key/value store already exists as app_settings in migration 003;
-- we'll just write a row with key='trending_top3_snapshot' to track changes.
