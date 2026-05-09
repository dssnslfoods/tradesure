-- Crypto AI Signal Webhook schema
-- Run inside the Supabase SQL editor or via `supabase db push`.

create extension if not exists "pgcrypto";

create table if not exists public.tradingview_signals (
  id           uuid primary key default gen_random_uuid(),
  symbol       text not null,
  exchange     text,
  interval     text not null,
  price        numeric,
  signal       text not null,
  strategy     text,
  raw_payload  jsonb not null,
  created_at   timestamptz not null default now()
);

create index if not exists tradingview_signals_created_at_idx
  on public.tradingview_signals (created_at desc);
create index if not exists tradingview_signals_symbol_idx
  on public.tradingview_signals (symbol);

create table if not exists public.ai_signal_analysis (
  id              uuid primary key default gen_random_uuid(),
  signal_id       uuid references public.tradingview_signals(id) on delete cascade,
  symbol          text not null,
  interval        text not null,
  bias            text,
  confidence      int,
  entry_zone      text,
  stop_loss       text,
  take_profit_1   text,
  take_profit_2   text,
  risk_level      text,
  summary_th      text,
  reasoning_th    text,
  telegram_sent   boolean not null default false,
  ai_raw_response jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists ai_signal_analysis_created_at_idx
  on public.ai_signal_analysis (created_at desc);
create index if not exists ai_signal_analysis_signal_id_idx
  on public.ai_signal_analysis (signal_id);

-- RLS: keep tables locked down; the webhook uses the service role key.
alter table public.tradingview_signals enable row level security;
alter table public.ai_signal_analysis  enable row level security;
