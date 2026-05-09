-- Backtest tracking: outcome of each AI signal vs. real market data.
-- Status values used in `outcome`:
--   PENDING   – not yet evaluated (default)
--   SKIP_WAIT – AI said WAIT, no trade simulated
--   WIN_TP1   – TP1 hit before SL
--   WIN_TP2   – TP2 hit before SL
--   LOSS_SL   – SL hit before any TP
--   OPEN      – still inside the simulation window, no level hit yet
--   NO_DATA   – evaluator couldn't fetch market data for the symbol
--   ERROR     – evaluator hit an unexpected error (see evaluator_note)

alter table public.ai_signal_analysis
  add column if not exists entry_low                  numeric,
  add column if not exists entry_high                 numeric,
  add column if not exists stop_loss_num              numeric,
  add column if not exists take_profit_1_num          numeric,
  add column if not exists take_profit_2_num          numeric,
  add column if not exists outcome                    text not null default 'PENDING',
  add column if not exists outcome_price              numeric,
  add column if not exists outcome_at                 timestamptz,
  add column if not exists pnl_pct                    numeric,
  add column if not exists max_favorable_excursion_pct numeric,
  add column if not exists max_adverse_excursion_pct  numeric,
  add column if not exists bars_evaluated             int,
  add column if not exists evaluated_at               timestamptz,
  add column if not exists evaluator_note             text;

create index if not exists ai_signal_analysis_outcome_idx
  on public.ai_signal_analysis (outcome);
