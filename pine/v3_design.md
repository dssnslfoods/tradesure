# Pine v3 — Intraday Futures Day-Trade Indicator (Design)

> Phase 2 deliverable. Review and approve before implementation (Phase 3 = strategy + backtest, Phase 4 = live indicator).

## 1. Purpose & Scope

- **Target user**: Futures day trader. Holding window minutes → hours, not days.
- **Target market**: BTC perpetual (USDT-M) primarily; symbol-agnostic so ETH/SOL/BNB work the same way.
- **Target frequency**: 2-5 signals per symbol per day. ~60-150 trades per month per symbol.
- **Tag**: every payload carries `"signal_type":"intraday"` → routed to `intraday` plan in webhook.
- **Coexistence**: lives alongside v2.1 Swing — they do NOT share state; admin picks which plan(s) to subscribe via dashboard.

## 2. Why a separate indicator (not just lower TF of v2.1)

v2.1's DNA is **trend-following with daily regime gate** — that gate cuts ~60% of intraday setups when BTC is in a sideways week, and most of v2.1's logic (Daily EMA200, big cooldown, 1.2 ATR stop) is optimized for hold time measured in days.

v3 trades a fundamentally different regime:
- **Intraday structure** — VWAP-anchored, session-aware, mean-reverting around session opens.
- **Tight risk geometry** — futures with leverage demands SL/TP measured in tens of basis points, not multi-percent.
- **No Daily gate** — Daily trend is *context*, not a hard filter. v3 can trade counter-Daily during a clear session reversal.
- **Funding-aware** — overcrowded longs (high positive funding) makes LONG entries riskier; v3 has an optional gate.

## 3. Inputs (TradingView UI)

| Input | Type | Default | Group | Notes |
|---|---|---|---|---|
| Secret | string (private) | "" | Webhook | TRADINGVIEW_WEBHOOK_SECRET |
| Bot name | string | "Tradesure Intraday" | Webhook | source field |
| Default TF | informational | 15m | — | Indicator does not lock TF, but defaults assume 15m |
| Fast EMA | int | 20 | EMA | |
| Slow EMA | int | 50 | EMA | |
| ATR length | int | 14 | Risk | |
| SL × ATR | float | 0.8 | Risk | Tighter than v2.1 (1.2) |
| TP1 R-multiple | float | 1.0 | Risk | 1:1 |
| TP2 R-multiple | float | 2.0 | Risk | 1:2 |
| Entry-zone × ATR | float | 0.3 | Risk | half-width of entry box |
| ADX min | int | 18 | Filter | Stronger than v2.1 (15) to compensate noisier TF |
| RSI Long zone | int×2 | 40 / 65 | Filter | Lower upper bound — futures shouldn't chase |
| RSI Short zone | int×2 | 35 / 60 | Filter | |
| Min Vol × MA | float | 1.1 | Filter | Volume confirmation |
| Cooldown bars | int | 2 | Filter | 2 × 15m = 30min anti-chop |
| Time-stop bars | int | 8 | Risk | 8 × 15m = 2hr — close at market if no TP1 |
| Use VWAP gate | bool | **true** | Filter | LONG only when close > VWAP, mirror for SHORT |
| Use session filter | bool | false | Filter | US session = 13:00-22:00 BKK |
| Use funding gate | bool | false | Filter | Skip LONG if funding > +0.05%, SHORT if < −0.05% |
| Use HTF trend (1H EMA50) | bool | false | Filter | Optional alignment to 1H |
| Use Daily trend (EMA200) | bool | false | Filter | Off by default — v3 is intraday |
| Enable NO_TRADE alert | bool | true | Webhook | Heartbeat every confirmed bar |

VWAP gate is **default ON** because it's the highest-impact futures intraday filter. Everything else default OFF — admin opts in after backtest.

## 4. Indicators & State

- `fastEma = ta.ema(close, 20)`
- `slowEma = ta.ema(close, 50)`
- `vwap = ta.vwap` (session-anchored, resets at session boundary by default)
- `rsi = ta.rsi(close, 14)`
- `[plusDi, minusDi, adx] = ta.dmi(14, 14)`
- `atr = ta.atr(14)`
- `volMa = ta.sma(volume, 20)`
- `htfEma1h = request.security(syminfo.tickerid, "60", ta.ema(close, 50), lookahead=barmerge.lookahead_off)`
- `dailyEma200 = request.security(syminfo.tickerid, "D", ta.ema(close, 200), lookahead=barmerge.lookahead_off)`

State / housekeeping:
- `var int barsSinceSignal = na` — cooldown tracker
- Time-stop is the responsibility of the consumer (backend tracks bar count after entry) — Pine just emits a `time_stop_bars` field in the payload.

## 5. Entry Rules

### LONG (all must be true)
1. **Cross**: `ta.crossover(fastEma, slowEma)` on this bar, OR fast > slow AND prior crossover within last 4 bars (pullback re-entry window).
2. **VWAP** (if `useVwapGate`): `close > vwap`.
3. **Trend strength**: `adx >= adxMin`.
4. **RSI zone**: `rsi in [rsiLongMin, rsiLongMax]`.
5. **Volume**: `volume >= volMa * minVolMult`.
6. **Cooldown**: `barsSinceSignal is na OR barsSinceSignal >= cooldownBars`.
7. **Session** (if `useSessionFilter`): current hour BKK in [13, 22).
8. **HTF** (if `useHtfTrend`): `close > htfEma1h`.
9. **Daily** (if `useDailyTrend`): `close > dailyEma200`.

### SHORT — mirror image.

## 6. Risk Geometry

For LONG entry at price `p`, ATR `a`:
- Entry zone: `[p − 0.3a, p + 0.3a]`
- SL: `p − 0.8a`
- Risk distance: `0.8a` ≡ 1R
- TP1: `p + 1.0R = p + 0.8a`
- TP2: `p + 2.0R = p + 1.6a`

SHORT mirrors (SL above, TPs below).

Worked example (BTC at $100,000, ATR $800):
- Entry zone: $99,760 – $100,240
- SL: $99,360 (-0.64%)
- TP1: $100,800 (+0.80%)
- TP2: $101,600 (+1.60%)

Compare v2.1 Swing on 1H BTC (typical ATR ~$1,500):
- SL: −1.8% (vs v3 −0.64%)
- TP1: +1.44% (vs v3 +0.80%)

v3 risks ~3× less per trade but takes ~3× more setups.

## 7. NO_TRADE Heartbeat — Reasons

Fired every confirmed bar when neither LONG nor SHORT triggers. Reason flags (extending v2.1):

| Flag | Meaning |
|---|---|
| `no_cross` | No EMA cross within lookback |
| `weak_trend` | ADX < threshold |
| `low_volume` | Volume below MA × multiplier |
| `dead_market` | (reserved — v3 doesn't use ATR% dead-market gate) |
| `cooldown` | Inside cooldown window |
| `rsi_out` | RSI outside entry zone |
| `vwap_misalign` | Setup but wrong side of VWAP — **new in v3** |
| `session_off` | Outside session filter — **new in v3** |
| `funding_extreme` | Funding rate too one-sided — **new in v3** (only flagged when gate is ON and funding data available) |
| `htf_misalign` | 1H trend disagrees |
| `daily_misalign` | Daily trend disagrees |

New REASON_LABELS_TH entries needed in `lib/telegram/sendTelegramMessage.ts`:
- `vwap_misalign`: "ราคาผิดด้าน VWAP (intraday gate)"
- `session_off`: "นอกช่วง trade session (US-session filter)"
- `funding_extreme`: "Funding rate เอียงข้างมาก — ความเสี่ยงสูง"

## 8. Webhook Payload (JSON)

All v2.1 fields plus:
- `"signal_type":"intraday"` (mandatory tag)
- `"vwap": <price>`
- `"session": "asia" | "eu" | "us"` (derived from bar hour BKK)
- `"time_stop_bars": 8` — backend uses this to flag positions for time-based exit
- `"rsi_long_min/max"`, `"rsi_short_min/max"` (so AI prompt sees the zone)

Funding rate is **not** sent from Pine (TradingView can't reliably fetch it) — backend can enrich at AI-prompt time if needed.

## 9. Status Table (overlay)

Top-right corner table, ~14 rows:
- Title: "v3 Intraday · {symbol} {tf}"
- Mode (LONG/SHORT/NEUTRAL based on EMA + VWAP)
- ADX with pass/fail color
- RSI with zone color
- Volume ratio
- VWAP delta % (close − vwap) / close
- Session (Asia/EU/US)
- Cooldown remaining
- Each optional filter on/off
- Last signal bar

## 10. Differences from v2.1 — Reference Table

| | v2.1 Swing | v3 Intraday |
|---|---|---|
| TF default | 1H | 15m |
| Fast / Slow EMA | 9 / 21 | 20 / 50 |
| Trend reference | EMA50 (in same TF) | VWAP (session-anchored) |
| ADX min | 15 | 18 |
| RSI Long zone | 40–70 | 40–65 |
| RSI Short zone | 30–60 | 35–60 |
| SL × ATR | 1.2 | 0.8 |
| TP1 / TP2 R | 0.8 / 1.6 | 1.0 / 2.0 |
| Time-stop | none | 8 bars (2hr) |
| Cooldown | 1 bar | 2 bars |
| Daily EMA filter | optional ON | optional OFF |
| Session filter | no | optional |
| Funding gate | no | optional |
| Status table rows | 13 | ~14 |
| Plan tag | swing | intraday |

## 11. Backtest Acceptance Criteria (Phase 3 gate)

12-month BTC 15m, default settings:
- **Trade count**: ≥ 100 (else stats are noisy)
- **Profit Factor**: ≥ 1.1 (matches v2.1 + Daily filter result, on a much faster TF)
- **Win rate**: ≥ 45%
- **Max drawdown**: ≤ 25% of starting equity (assuming 25% position size, no leverage)
- **Average trade duration**: ≤ 12 bars (3hr) — verifies it actually behaves like day trade

Variants to test in Phase 3:
- v3 default (VWAP only)
- v3 + session filter (US only)
- v3 + session + HTF (1H EMA50)
- v3 + all gates on

If v3 default fails the acceptance bar, iterate parameters before adding more filters.

## 12. Implementation Notes / Risks

- **VWAP daily reset**: TradingView's `ta.vwap` resets each session. For 15m BTC futures, that's 00:00 UTC. Acceptable but worth noting in help docs.
- **`request.security` + `lookahead=off`** is required for HTF/Daily EMAs to avoid repaint.
- **Cooldown vs cross-recapture**: 2-bar cooldown might suppress legitimate re-entries after pullbacks. Backtest will tell.
- **Funding rate**: not in Pine — backend should optionally inject it into AI prompt or block at webhook level (TODO Phase 4 decision).
- **Time-stop**: Pine emits the value; the backtest evaluator (`lib/backtest/evaluateSignal.ts`) needs an update to honor it for v3 signals.

## 13. Phase 3 Plan (next, after this design is approved)

1. Write `pine/btc_futures_strategy_v3.pine` — strategy version of v3 for backtest.
2. Run 12-month backtest on BTC 15m in TradingView Strategy Tester.
3. Tune the **default** parameters only — keep optional gates off by default.
4. Document results (PF, win rate, drawdown, trade count, avg duration) in `pine/v3_backtest_results.md`.
5. If acceptance criteria met → proceed to Phase 4 (live indicator file + alert setup).
6. If not met → iterate parameters once. If still failing, escalate to admin for design changes before re-spec.

## 14. Open Questions for Admin

1. **TF lock**: should v3 indicator throw an error / show a warning if user puts it on a chart that isn't 15m? Or allow 5m/30m experimentation?
   - Recommendation: warn but don't block.
2. **Backtest position size**: 25% of equity (same as v1.3) or higher (e.g., 10% × 5 concurrent trades budget)?
   - Recommendation: 25% with no overlapping positions, matches v1.3 methodology so results are comparable.
3. **Time-stop enforcement**: Pine sends the value but the *backtest evaluator* doesn't currently honor a time-stop. Do we update `evaluateSignal.ts` as part of Phase 3, or test without time-stop first and add it later?
   - Recommendation: test with time-stop on, since it's a core part of v3's identity. Small edit to evaluator.
4. **Funding gate** — backend or Pine? Pine can't fetch funding reliably. Options:
   - Skip the gate entirely (simplest)
   - Backend filters at webhook level using Binance funding endpoint (we already query funding for AI context)
   - Recommendation: backend filter. Add a `funding_extreme` synthetic reject reason if it kicks in.
5. **Should v3 still respect AI active schedule + blocked hours?** Yes — those are global filters, not plan-specific. Confirm.

---

**Status**: 🟡 Awaiting admin review.
**Approver**: admin (golf)
**Next step**: confirm Open Questions §14 → proceed to Phase 3 (strategy file + backtest).
