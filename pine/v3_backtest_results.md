# Pine v3 — Backtest Results & Decision

> Closes Phase 3 of the multi-plan rollout. Documents 7 backtest variants and the
> decision to abort Phase 4 (live indicator).

**Date**: 2026-05-14
**Decision**: 🛑 **Abort Phase 3-4** — keep multi-plan infrastructure, do not deploy Pine v3 live.
**Status**: Documented for future reference. Code in `pine/btc_futures_strategy_v3.pine` retained.

---

## 1. Acceptance Criteria (from v3_design.md §11)

12-month BTC backtest, default settings:
- Trades ≥ 100
- Profit Factor ≥ 1.1
- Win rate ≥ 45%
- Max drawdown ≤ 25%
- Avg trade duration ≤ 12 bars

---

## 2. Test Results (7 variants)

All tests on BTCUSDT, strategy v3, 25% per trade, no leverage, 0.04% commission, 2 ticks slippage.

| # | TF | Config | Period | Trades | WR | PF | LONG PF | SHORT PF | Max DD | vs B&H |
|---|---|---|---|---|---|---|---|---|---|---|
| A | 15m | partial+runner, no filters | 16mo | 130 | 56.15% | 0.75 | — | — | 3.49% | +24% |
| B | 1H | full exit | 16mo | 92 | 50.00% | 0.725 | — | — | — | — |
| C | 15m | TP1=1.5R | 4.5mo | 108 | 37.04% | 0.58 | — | — | 3.59% | +24% |
| D | 15m | full exit, default | 4.5mo | 114 | 41.23% | 0.643 | — | — | 1.95% | +7.76% |
| E | 15m | + session + 1H HTF | 3.5mo | 32 | 34.38% | 0.551 | — | — | 0.67% | +10.7% |
| **F1** ⭐ | **30m** | **partial+runner, default** | **16mo** | **251** | **54.98%** | **0.754** | **0.963** | **0.604** | **2.68%** | **+15%** |
| G1 | 30m | full exit | 16mo | 177 | 48.02% | 0.711 | 0.876 | 0.596 | 2.97% | +14.9% |

Best variant: **F1** (30m, partial+runner, all default filters off).

### F1 Detailed Numbers
- Net P&L: -$227.77 (-2.28% of $10k initial)
- Buy & Hold: -$1,718 (-17.19%) — BTC dropped over the period
- Strategy outperformance: +$1,490.87
- Long: 122 trades, 59.84% WR, PF 0.963, avg w/l 0.647
- Short: 129 trades, 50.39% WR, PF 0.604, avg w/l 0.594
- Avg bars in trade: 4 (= 2 hours on 30m)

---

## 3. Key Findings

### 3.1 LONG side has marginal edge
LONG PF reached 0.963 (Test F1) — within 4% of breakeven. The entry rules
(EMA20/50 cross + VWAP + ADX ≥ 18 + RSI band) catch enough trend continuation
to almost overcome commission, but not enough to clear the 1.1 bar.

### 3.2 SHORT side has structural losses
SHORT PF stuck around 0.60 across every variant. The strategy was tested
during a -17% to -26% BTC period — shorts *should* have an edge — yet they
consistently lost. Hypothesis: EMA cross is a trend-following pattern, and
bear markets in crypto produce violent counter-trend bounces that hit SL
before the trend resumes. Trend-following SHORT entries are too late.

### 3.3 Commission ate the edge
At TP1 = SL distance = 0.8 ATR (1R), commission round-trip (0.08%) plus
slippage roughly equals 20% of an average winning trade's gross. With
WR ~50%, the strategy needs avg_win > avg_loss by 20%+ to overcome
commissions. The geometry didn't deliver that.

### 3.4 Filters made it worse, not better
Every filter we tried — session (US-only), 1H HTF alignment, raised TP1 —
reduced trade count by 50-70% but didn't lift PF. The "good" trades being
filtered out had similar win rate to the "bad" ones being kept.

### 3.5 Lower TF ≠ better edge
We went 15m → 1H → 30m. PF was nearly identical across all three (0.71-0.75).
Trade frequency scaled with TF as expected, but per-trade edge did not.

### 3.6 Capital preservation works
Max DD < 3% on all 16-month variants. Strategy beat Buy & Hold by 15-24% in
a falling market. v3 *would* be a useful capital-preservation overlay in
a bear market — just not a profitable system on its own.

---

## 4. Why We Abort (Option 1)

| Reason | Detail |
|---|---|
| No variant cleared acceptance | PF ceiling ~0.75 across 7 variants |
| Pattern is systemic | LONG/SHORT asymmetry visible in every test |
| Opportunity cost | Time iterating v3 better spent on v2.1 + multi-symbol |
| Product standard | Paying users expect signals with positive expectancy, not capital preservation in bear markets |
| Infrastructure preserved | Phase 1a+1b multi-plan code stays — future v3-redesign can plug in |

---

## 5. What's Preserved vs Removed

### Preserved
- `pine/btc_futures_strategy_v3.pine` — strategy file (can re-tune later)
- `pine/v3_design.md` — original design spec
- Multi-plan backend (migration 007, `signal_type` column, `active_trading_plans` setting)
- Multi-plan UI (admin toggle, dashboard plan filter, badges, broadcast snapshot)
- Webhook plan filter (reject signals from disabled plans)

### Removed / Not Shipped
- No live Pine v3 indicator file
- No TradingView alert setup for intraday plan
- Default `active_trading_plans` changed to `["swing"]` only

### Admin Behavior After Abort
- Active plans default: `["swing"]` (intraday off)
- Admin can still toggle `intraday` chip ON via dashboard if/when a working v3
  indicator ships in the future — no migration needed
- All existing signals tagged `swing` (legacy NULL rows backfilled to swing too)

---

## 6. If We Re-Attempt (Future Notes)

Things to try if intraday day-trade is revisited:

1. **Different entry primitive** — drop EMA cross, try:
   - VWAP reclaim (price breaks below VWAP, reclaims, enter at retest)
   - Asian session range breakout into EU/US session
   - Mean reversion at BB extremes + RSI divergence
2. **Asymmetric handling of LONG vs SHORT** — SHORT was structurally losing.
   Either:
   - LONG-only intraday plan
   - SHORT requires stricter ADX (≥ 25) + must be aligned with Daily downtrend
3. **Funding-rate gate** — when funding > +0.1% block LONG; < -0.1% block SHORT
4. **TF: stick with 30m** — gave the best PF (0.754) and trade count balance
5. **Higher acceptance bar for shipping** — if PF < 1.2 in backtest, don't ship.
   v3 attempt taught us PF 0.7-0.95 in backtest = real-money losing.

---

## 7. Lessons for Future Strategy Iterations

1. **Test on the broadest possible period first** — 4 of 7 tests were on partial
   data because TV plan limits caught us mid-iteration. Always lock the period
   first.
2. **Test ONE variable at a time** — Test E changed 2 inputs (session + HTF) and
   we lost the diagnostic.
3. **Don't add filters before fixing core entry** — every filter we added made
   things worse. The base entry has to clear PF 1.0 BEFORE adding gates.
4. **Watch commission economics early** — TP1 = SL distance means commission
   alone eats ~20% of edge. The R:R should account for fees from the start.
5. **LONG/SHORT asymmetry is a real signal** — if one side has PF 0.96 and the
   other 0.60, that's not noise — it's the entry rules misaligned with one
   regime.

---

**Owner**: admin (golf)
**Reviewed**: 2026-05-14
**Re-evaluation trigger**: when admin decides to revisit intraday day-trade signals.
