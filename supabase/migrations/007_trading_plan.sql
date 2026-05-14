-- 007_trading_plan.sql
-- Phase 1a: Multi-plan signal support
--
-- Adds a `signal_type` column to tradingview_signals so the system can tag each
-- alert as belonging to a trading plan ("swing" for the existing 1H indicator
-- v2.1, "intraday" for the upcoming 15m day-trade indicator v3).
--
-- Backwards-compat: legacy rows with NULL signal_type are treated as "swing"
-- (the only plan that existed when they were written).

alter table public.tradingview_signals
  add column if not exists signal_type text;

-- Optional index for plan-filtered queries on the dashboard.
create index if not exists idx_tradingview_signals_signal_type
  on public.tradingview_signals (signal_type);

-- Backfill historical rows: everything pre-Phase-1a belongs to the swing plan.
update public.tradingview_signals
   set signal_type = 'swing'
 where signal_type is null;

comment on column public.tradingview_signals.signal_type is
  'Trading plan tag: "swing" (1H indicator v2.1) or "intraday" (15m indicator v3). NULL = legacy/unknown.';
