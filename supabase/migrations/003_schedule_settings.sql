-- Backtest scheduler: pause/resume + run log.
--
-- The Cloud Scheduler job hits /api/backtest/run every 15 min. Before doing
-- work, the API consults app_settings to decide whether to actually run.
-- Each run also writes a row into backtest_runs so the UI can show history.

create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- Seed the schedule entry. enabled=true; interval_minutes is informational
-- (the real cadence comes from Cloud Scheduler).
insert into public.app_settings (key, value)
values (
  'backtest_schedule',
  jsonb_build_object(
    'enabled', true,
    'interval_minutes', 15,
    'paused_reason', null,
    'last_run_at', null,
    'last_result', null
  )
)
on conflict (key) do nothing;

create table if not exists public.backtest_runs (
  id           uuid primary key default gen_random_uuid(),
  triggered_by text not null check (triggered_by in ('cron', 'manual', 'webhook')),
  evaluated    int not null default 0,
  win          int not null default 0,
  loss         int not null default 0,
  open         int not null default 0,
  skipped      int not null default 0,
  win_rate_pct numeric,
  duration_ms  int,
  error        text,
  created_at   timestamptz not null default now()
);

create index if not exists backtest_runs_created_at_idx
  on public.backtest_runs (created_at desc);

alter table public.app_settings  enable row level security;
alter table public.backtest_runs enable row level security;
