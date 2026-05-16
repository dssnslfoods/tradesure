-- 008_recommended_flag.sql
-- Always-direction signals: AI now picks LONG or SHORT for every signal
-- (no more WAIT) and provides full entry/SL/TP. The `recommended` boolean
-- captures whether AI + admin filters say the trade should actually be
-- taken — independent of whether the signal is stored.
--
-- Behavior change: previously low-conviction signals were stored as
-- outcome=SKIP_WAIT/SKIP_LOW_CONF/SKIP_HOUR (no backtest, no stats).
-- Now they're stored with bias=LONG/SHORT, outcome=PENDING, and
-- recommended=false. Backtest evaluates them so we can answer
-- "if I only took 70%+ confidence trades, what's my win rate?"

alter table public.ai_signal_analysis
  add column if not exists recommended boolean,
  add column if not exists recommendation_reason text;

comment on column public.ai_signal_analysis.recommended is
  'Whether AI + admin filters recommend taking this trade. NULL = legacy row (pre-Phase-2). FALSE = AI/filters said skip but the trade plan was still recorded for stats.';

comment on column public.ai_signal_analysis.recommendation_reason is
  'Human-readable reason when recommended=FALSE (e.g., "low confidence 45%", "blocked hour 14:00", "vote disagree").';

-- Backfill helpful index for the new analytics queries (filter by
-- confidence bucket + plan + outcome).
create index if not exists idx_ai_analysis_confidence_outcome
  on public.ai_signal_analysis (confidence, outcome);

-- Legacy SKIP_WAIT rows: leave outcome alone (they have no entry/SL/TP
-- so we can't backtest them anyway). The new "recommended=false but
-- bias=LONG/SHORT with levels" pattern only applies to data going forward.
