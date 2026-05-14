# Pine v3.5 — Backtest Results & Final Abort

> Closes the second intraday attempt (VWAP reclaim) after v3 (EMA cross)
> was aborted on 2026-05-14. See `pine/v3_backtest_results.md` for v3's
> lessons that informed v3.5's design.

**Date**: 2026-05-14
**Decision**: 🛑 **Final abort of 15m intraday plan** — combined evidence from
v3 (7 variants) and v3.5 (2 variants) shows no simple intraday pattern
clears the PF ≥ 1.1 acceptance bar on 15m BTC during the 2025-2026 period.
**Status**: Source files retained (`pine/btc_futures_strategy_v3_5.pine`)
for future redesign. Default `active_trading_plans` stays `["swing"]`.

---

## 1. v3.5 Test Results (2 variants)

| Test | Config | Trades | WR | PF | LONG PF | SHORT PF | Max DD | vs B&H |
|---|---|---|---|---|---|---|---|---|
| H | 15m default (volume + RSI + 2-bar confirm) | 57 | 38.60% | 0.515 | 0.304 | 0.799 | 1.42% | +$1,010 |
| I | H + 1H HTF gate | 30 | 23.33% | 0.399 | 0.196 | 0.78 | 1.19% | +$1,253 |

All tests on BTCUSDT 15m, Jan 1 2026 → May 14 2026 (4.5 months, TV plan limit).

---

## 2. Key Findings (v3.5 specific)

### 2.1 LONG/SHORT asymmetry FLIPPED from v3

| | v3 (EMA cross) | v3.5 (VWAP reclaim) |
|---|---|---|
| LONG PF | 0.96 ✅ | 0.30 ❌ |
| SHORT PF | 0.60 ❌ | 0.80 ✅ |

**Interpretation**: in a bear-biased test period, the LONG/SHORT edge depends
on whether the strategy is trend-following or mean-reverting — but no simple
strategy works on both sides simultaneously.

- v3 (trend-follow): caught the rare uptrends on LONG side, got bounce-killed on SHORT
- v3.5 (mean reversion): caught bear continuation on SHORT side (VWAP reclaims-down were the bounces failing), got dead-cat-bounced on LONG

Neither pattern's edge is symmetric in a directional market. The "pattern doesn't matter — regime does" lesson.

### 2.2 Dynamic R worked, but didn't matter

Avg win/loss ratio improved from v3's 0.62 → 0.82 (Test H), validating that
swing-based dynamic SL is mechanically better than fixed ATR. But the WR
collapse (55% → 38%) more than offset this gain. **Strategy mechanics fix
doesn't solve a missing edge.**

### 2.3 HTF gate killed the trigger

Test I (added 1H EMA50 gate) cut trades 47% but WR collapsed from 38% → 23%.
The reclaim trigger fires at *reversal*; the HTF gate demands *continuation*.
The intersection is signals that came late after the move already happened.

**Generalized lesson (across v3 + v3.5)**: filtering a counter-trend pattern
with a trend-alignment gate makes it worse, not better. Filter design must
match trigger philosophy.

### 2.4 Capital preservation, again

v3.5 beat Buy & Hold by +$1,010 to +$1,253 even with PF < 1. Same story as
v3 — these strategies preserve capital in bear markets but don't print money.
Useful as defensive overlays but not standalone profitable systems.

---

## 3. Combined Evidence: 9 Variants, 2 Patterns, 0 Passes

| # | Pattern | Test | TF | PF |
|---|---|---|---|---|
| 1 | EMA cross | A | 15m | 0.75 |
| 2 | EMA cross | B | 1H | 0.725 |
| 3 | EMA cross | C (TP=1.5R) | 15m | 0.58 |
| 4 | EMA cross | D (full exit) | 15m | 0.643 |
| 5 | EMA cross | E (session+HTF) | 15m | 0.551 |
| 6 | EMA cross | F1 (best of v3) ⭐ | 30m | 0.754 |
| 7 | EMA cross | G1 (full exit) | 30m | 0.711 |
| 8 | VWAP reclaim | H (best of v3.5) | 15m | 0.515 |
| 9 | VWAP reclaim | I (+HTF) | 15m | 0.399 |

Acceptance bar: PF ≥ 1.1. **Ceiling across all variants: 0.754.**

---

## 4. Why Final Abort (Not Continue)

| Reason | Detail |
|---|---|
| Pattern-independent ceiling | EMA cross + VWAP reclaim both stuck ≤ 0.76. The issue isn't the trigger. |
| Diminishing returns | 9 tests over 2 sessions; effort/outcome curve flat |
| Test period bias | BTC -17% to -26% for the period skews any directional strategy |
| Better use of time | v2.1 swing is proven; multi-symbol coverage compounds it 4× |
| Live shipping risk | Paying users + PF < 1 backtest = real losses |

---

## 5. What's Preserved

### Source files (retained for future redesign)
- `pine/btc_futures_strategy_v3.pine` — EMA cross strategy
- `pine/btc_futures_strategy_v3_5.pine` — VWAP reclaim strategy
- `pine/v3_design.md` + `v3_backtest_results.md`
- `pine/v3_5_design.md` + this file

### Infrastructure (active in production)
- Multi-plan backend (migration 007, `signal_type` column, plan filter at webhook)
- Multi-plan UI (admin toggle, dashboard filter chips, badges)
- Test broadcast snapshot includes active plans

### Default state
- `active_trading_plans = ["swing"]` — set during v3 abort, unchanged
- Admin can still toggle "Intraday" chip ON via dashboard if/when a future
  redesign ships an indicator that tags `signal_type:"intraday"`

---

## 6. Conditions That Would Justify Re-Attempt

Don't re-open intraday work until at least one of these is true:

1. **BTC enters a clear bull regime (≥ 3 months sustained uptrend)** — current bear bias may be masking edge that exists in other regimes
2. **A fundamentally different signal source is available** — e.g., funding rate divergence, options flow data, on-chain triggers (not just price/volume patterns)
3. **TradingView gives access to longer custom backtest ranges** (current plan limits to ~4-5 months on 15m) — wider regime sampling could change conclusions
4. **The user explicitly accepts PF ~0.9 strategies as "capital preservation"** and is willing to ship with that framing

Until then: focus is v2.1 swing optimization + multi-symbol coverage.

---

## 7. Lessons (Compounded from v3 + v3.5)

1. **Test on the widest period available before iterating** — v3 had 16mo, v3.5 only 4.5mo. We compared apples to oranges twice.
2. **Filter philosophy must match trigger philosophy** — trend-aligned filter on counter-trend trigger = worse, not better.
3. **LONG/SHORT asymmetry > 30% PF gap = real regime sensitivity** — single-pattern intraday strategies are vulnerable to market regime shifts.
4. **Avg win/loss ratio matters but not in isolation** — improving mechanics (dynamic R, time-stop) doesn't rescue a missing core edge.
5. **Commission economics dominate at small R** — when TP1 = SL distance (1R), commission alone is ~20% of edge. Strategies must build in larger R or higher base WR.
6. **Capital preservation ≠ profitable strategy** — beating B&H in a bear is necessary but not sufficient to ship to paying users.
7. **9 tests over 2 sessions is enough** — don't keep iterating when the ceiling is clear across orthogonal approaches.

---

**Owner**: admin (golf)
**Reviewed**: 2026-05-14
**Re-evaluation trigger**: see §6 conditions.
