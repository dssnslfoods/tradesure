# Pine v3.5 — VWAP Reclaim Intraday Indicator (Design)

> Phase 2 redo after v3 (EMA cross intraday) was aborted on 2026-05-14.
> See `pine/v3_backtest_results.md` for the lessons that informed this design.

## 1. Purpose & Scope

- **Target user**: Intraday futures trader — hold time 30 min to 3 hours.
- **Target market**: BTCUSDT perpetual; symbol-agnostic.
- **Target frequency**: 3-6 signals per symbol per day on 15m. ~80-150 trades/month.
- **TF default**: 15m (per admin decision 2026-05-14).
- **Plan tag**: `"signal_type":"intraday"` — routes through the existing Phase 1 multi-plan infrastructure.
- **Coexistence**: lives alongside v2.1.1 Swing.

## 2. Why a New Design (vs v3 EMA Cross)

The v3 backtest (7 variants) proved EMA cross is the wrong primary trigger for 15m BTC:

| Problem in v3 | How v3.5 addresses it |
|---|---|
| LONG PF 0.96 vs SHORT PF 0.60 — asymmetric | VWAP reclaim is structurally symmetric — same pattern both directions |
| Commission ate edge (TP=SL distance) | Dynamic SL from swing structure → larger R when volatility low, naturally bigger TP |
| Filters always made it worse | Confirmations are built INTO the trigger (setup ≥ 3 bars, volume), not bolted on |
| EMA cross fires late in trend | VWAP reclaim fires at *capitulation reversal* — earliest, not latest |
| Bear-market counter-trend bounces killed shorts | Reclaim is a counter-trend trigger BY DESIGN — bounces ARE the entry |

VWAP is an institutional anchor (algos, MMs benchmark off it). A reclaim after sustained price violation = real order flow shift, not noise.

## 3. Inputs (TradingView UI)

| Input | Type | Default | Group | Notes |
|---|---|---|---|---|
| Secret | string (private) | "" | Webhook | TRADINGVIEW_WEBHOOK_SECRET |
| Bot name | string | "Tradesure Intraday" | Webhook | source field |
| **Setup min bars under/over VWAP** | int | 3 | Setup | LONG: bars under VWAP before reclaim. SHORT: bars over. |
| **Setup max bars** | int | 20 | Setup | Stale setups expire — reclaim from 50 bars ago isn't a reclaim |
| **Require 2-bar confirmation** | bool | true | Setup | LONG: close > VWAP for 2 consecutive bars. Cuts whipsaw. |
| Volume confirmation × MA | float | 1.2 | Setup | Reclaim bar's volume ≥ 1.2× MA20 |
| Use volume confirmation | bool | true | Setup | Highly recommended ON — no-volume reclaims are noise |
| RSI Length | int | 14 | Filter | |
| Min RSI for LONG | int | 35 | Filter | Must be ≥ 35 (out of oversold) to confirm bullish flip |
| Max RSI for SHORT | int | 65 | Filter | Must be ≤ 65 (out of overbought) |
| ATR Length | int | 14 | Risk | |
| Swing-low lookback | int | 10 | Risk | Bars back to find structural swing low (LONG SL anchor) |
| SL buffer × ATR | float | 0.2 | Risk | Extra room below swing low to dodge wick |
| **TP1 R-multiple** | float | 1.0 | Risk | |
| **TP2 R-multiple** | float | 2.0 | Risk | Only used in partial+runner mode (default OFF in v3.5) |
| Time-stop bars | int | 6 | Risk | 6 × 15m = 90 min. If reclaim is real, momentum is fast. |
| Entry-zone × ATR | float | 0.2 | Risk | Half-width for entry box display |
| Cooldown bars | int | 3 | Filter | 45 min between signals — anti chop |
| **Exit mode** | dropdown | "Full exit at TP1" | Exit | Learned from v3: partial+runner BE-drag is real |
| Use session filter | bool | false | Filter | US session 13:00-22:00 BKK |
| Use 1H trend gate | bool | false | Filter | LONG only if 1H EMA50 trending up — optional |
| Enable NO_TRADE alert | bool | true | Webhook | Heartbeat |

### Default rationale

- VWAP reclaim is the trigger — most defaults are conservative
- Volume confirmation default ON (key lesson from v3: ungated reclaims = chop)
- Exit mode default = Full exit at TP1 (no partial+runner BE drag)
- All optional gates default OFF — admin opts in only after backtest

## 4. Indicators & State

```pine
vwapVal     = ta.vwap                                     // session-anchored
rsi         = ta.rsi(close, 14)
[_, _, adx] = ta.dmi(14, 14)
atr         = ta.atr(14)
volMa       = ta.sma(volume, 20)
htfEma1h    = request.security(syminfo.tickerid, "60",
                                ta.ema(close, 50),
                                lookahead=barmerge.lookahead_off)
```

### State trackers
- `var int barsUnderVwap = 0` — counts bars where close < vwap (LONG setup)
- `var int barsOverVwap  = 0` — counts bars where close > vwap (SHORT setup)
- `var float swingLow    = na` — running swing low during LONG setup (for SL)
- `var float swingHigh   = na` — running swing high during SHORT setup
- `var int barsSinceSignal = na` — cooldown
- `var int posBar         = na` — for time-stop

### State update (each bar)
```
if close < vwap:
    barsUnderVwap += 1
    barsOverVwap   = 0
    swingLow       = (barsUnderVwap == 1 ? low : math.min(swingLow, low))
else if close > vwap:
    barsOverVwap  += 1
    barsUnderVwap  = 0
    swingHigh      = (barsOverVwap == 1 ? high : math.max(swingHigh, high))
```

## 5. Entry Rules

### LONG — all must be true

1. **Reclaim event**: `ta.crossover(close, vwap)` THIS bar
2. **Setup depth**: previous `barsUnderVwap[1] >= setupMinBars` (e.g., ≥ 3 bars under)
3. **Setup freshness**: `barsUnderVwap[1] <= setupMaxBars` (e.g., ≤ 20 bars — not stale)
4. **Volume** (if `useVolumeConfirm`): `volume >= volMa * volMult`
5. **RSI** (if `useRsiGate`): `rsi >= rsiLongMin` (not deep oversold — flip confirmed)
6. **2-bar confirm** (if `useTwoBarConfirm`): also require `close[1] > vwap[1]` next bar — fires entry next bar instead (defer)
7. **Cooldown**: `barsSinceSignal is na OR (bar_index - barsSinceSignal) >= cooldownBars`
8. **Session** (if `useSessionFilter`): hour BKK ∈ [13, 22)
9. **HTF** (if `useHtfGate`): `close > htfEma1h`

### SHORT — mirror

1. `ta.crossunder(close, vwap)`
2. `barsOverVwap[1] >= setupMinBars`
3. `barsOverVwap[1] <= setupMaxBars`
4. Volume same
5. RSI: `rsi <= rsiShortMax`
6. 2-bar confirm: `close[1] < vwap[1]`
7. Cooldown / session / HTF same

### Implementation note on 2-bar confirm

If `useTwoBarConfirm = true`, the indicator should:
- Detect the reclaim on bar T
- Wait for bar T+1 confirmation
- Fire signal on bar T+1 close

This is one extra bar of delay (15 min) but cuts ~30-40% of whipsaw false signals.

## 6. Risk Geometry — Dynamic Swing-Based

### LONG entry at close = `p`

- **Stop-loss**: `swingLow - atr * slBufferMult` (e.g., swing low − 0.2 ATR)
- **Risk**: `R = p - SL`
- **TP1**: `p + R * tp1Mult` (default 1.0R)
- **TP2** (partial mode only): `p + R * tp2Mult`

### SHORT entry at close = `p`

- **Stop-loss**: `swingHigh + atr * slBufferMult`
- **Risk**: `R = SL - p`
- **TP1**: `p - R * tp1Mult`
- **TP2**: `p - R * tp2Mult`

### Why dynamic SL > fixed ATR SL

Fixed ATR SL (v3 used 0.8 ATR) meant *every* trade had similar R distance regardless of structure. Reclaim entries naturally have structural SL = the low/high that was just printed during capitulation. Trades into bigger swings get bigger R (and bigger TP); trades into tight ranges get tight R. R:R ratio stays 1:1 by design but absolute R varies with volatility — commission % impact varies *inversely* with volatility (good).

### Worked example (BTC 100k, ATR 400)

LONG setup: 4 bars under VWAP at 99,500. Swing low 99,200.
- Reclaim bar closes at 100,100
- SL = 99,200 − 0.2×400 = 99,120
- R = 100,100 − 99,120 = 980 (~0.98%)
- TP1 = 101,080 (~+0.98%)

Compare v3 fixed: R = 0.8 × 400 = 320 (0.32%). v3.5 R is ~3× bigger → commission is 25% of R, not 25% × 0.32% = 0.08% per trade as % of R (8% of R, much smaller drag).

## 7. NO_TRADE Heartbeat — Reasons

New reason taxonomy (extends v2.1):

| Flag | Meaning | New in v3.5? |
|---|---|---|
| `no_setup` | No reclaim event this bar | new |
| `setup_too_short` | Reclaim but barsUnder/Over < min | new |
| `setup_stale` | Reclaim but setup older than maxBars | new |
| `low_volume` | Volume below MA × multiplier | shared |
| `rsi_out` | RSI outside acceptance band | shared |
| `cooldown` | Inside cooldown window | shared |
| `vwap_misalign` | (n/a for v3.5 — reclaim IS the trigger) | — |
| `session_off` | Outside session filter | shared |
| `htf_misalign` | 1H trend disagrees | shared |

`REASON_LABELS_TH` additions for `lib/telegram/sendTelegramMessage.ts`:
- `no_setup`: "ไม่มี VWAP reclaim ใน bar นี้"
- `setup_too_short`: "Setup ตื้นเกินไป (รอ flush แรงกว่า)"
- `setup_stale`: "Setup เก่าเกินไป (reclaim ช้าไป)"

## 8. Webhook Payload (for future live indicator)

All v2.1 fields plus:
- `"signal_type":"intraday"` (mandatory tag)
- `"vwap": <price>`
- `"swing_anchor": <price>` — the swing low/high that SL is based on
- `"bars_in_setup": <int>` — how long the capitulation lasted
- `"reclaim_bar_volume_ratio": <float>` — volume / volMa at the reclaim bar
- `"session": "asia" | "eu" | "us"`
- `"time_stop_bars": 6`

## 9. Status Table

Top-right corner, ~14 rows:
- Title: "v3.5 VWAP Reclaim · {symbol} {tf}"
- Position state: setup-LONG / setup-SHORT / armed-LONG / armed-SHORT / flat
- Bars under/over VWAP (whichever is active)
- VWAP Δ %
- Swing anchor price + distance
- Volume ratio
- RSI with zone color
- Cooldown remaining
- Session
- Each gate on/off
- Last signal bar

## 10. Differences from v3 (Aborted) — Reference

| | v3 (aborted) | **v3.5 (proposed)** |
|---|---|---|
| Trigger | EMA20/50 cross | **VWAP reclaim after sustained violation** |
| Setup detection | Single-bar event | **Multi-bar capitulation phase** |
| SL anchor | Fixed 0.8 ATR | **Dynamic swing low/high + buffer** |
| R sizing | Fixed | **Varies with volatility regime** |
| TP | Fixed R-multiple | **R-multiple with dynamic R base** |
| Symmetric LONG/SHORT? | ❌ Short PF 0.60 | ✅ Same trigger geometry |
| Trend reference | EMA20/50 | **VWAP** (session-anchored institutional) |
| Volume role | Filter (could fail) | **Confirmation of reclaim** (core, default ON) |
| Time-stop | 8 bars | **6 bars** (tighter — reclaim should be fast) |
| Cooldown | 2 bars | **3 bars** (more anti-chop) |
| Exit mode default | partial+runner | **Full exit at TP1** (no BE drag) |
| Optional gates | session/HTF/daily | session/HTF (no daily — intraday) |

## 11. Backtest Acceptance Criteria (Phase 3 Gate)

Same bar as v3 — but with the post-v3 lessons baked in:
- **Trades**: ≥ 80 per 12mo period (lower than v3's 100 because dynamic R = fewer-higher-quality trades)
- **Profit Factor**: ≥ 1.1
- **Win rate**: ≥ 45%
- **Max DD**: ≤ 25%
- **Avg trade duration**: ≤ 10 bars (2.5 hours)
- **LONG PF and SHORT PF both ≥ 1.0** ← new requirement from v3 lessons

### Variants to test in priority order

1. **Default**: VWAP reclaim, volume confirm ON, no other gates
2. Default + session filter (US 13-22 BKK)
3. Default + HTF (1H EMA50)
4. Default + 2-bar confirm OFF (see if confirmation drag > whipsaw cut)
5. Default + partial+runner (only if default passes PF 1.1)

## 12. Implementation Notes / Risks

- **TradingView VWAP session reset**: `ta.vwap` resets at session boundary (00:00 UTC default). Setup counter must reset too — when VWAP value jumps discontinuously, `barsUnder` / `barsOver` should reset.
- **Swing tracking through reclaim**: Once reclaim fires and position opens, the swing anchor is locked. Setup state resets after entry to start fresh.
- **2-bar confirm timing**: implementation must use `crossover(close, vwap)[1]` and `close > vwap` check — fires signal on bar T+1, not T.
- **Dynamic R can blow up if swing is very far**: clamp R to max 3× ATR to prevent extreme outliers from a deep flush eating the position size sanity.
- **VWAP at session edge**: bars near session reset have unstable VWAP — first 5 bars of each session should suppress signals (built into setup-min-bars naturally).

## 13. Phase 3 Plan

1. Write `pine/btc_futures_strategy_v3_5.pine` — strategy version for Strategy Tester.
2. Backtest on BTC 15m, defaults only first. Use whatever data range TV gives (note: F1 was 16mo, that's likely available).
3. Document results in `pine/v3_5_backtest_results.md` — table of variants per acceptance criteria §11.
4. If **default** passes PF 1.1 + symmetric LONG/SHORT ≥ 1.0 → proceed to live indicator (Phase 4).
5. If default fails but LONG ≥ 1.1 and SHORT < 1.0 → ship as LONG-only intraday plan.
6. If both fail → reassess. May try session filter as last gate before final abort.

## 14. Open Questions for Admin

1. **Setup min bars**: 3 bars (~45 min) — good or want longer (e.g., 5 bars = 75 min)?
   - Recommendation: 3 — too long misses fast flushes.
2. **R clamp**: clamp risk to max 3× ATR? If a flush goes 5 ATR deep, do we still take it (huge SL distance, full position size could be too risky)?
   - Recommendation: clamp at 3× ATR. Skip signal if swing distance > 3 ATR.
3. **Session reset behavior**: when VWAP resets at 00:00 UTC, do we reset setup counters AND cancel any armed setup?
   - Recommendation: reset counters and cancel armed setups — fresh session, fresh slate.
4. **Live indicator ship policy**: same as v3 — only ship if backtest passes acceptance AND LONG/SHORT PF both ≥ 1.0?
   - Recommendation: yes, learn from v3.

---

**Status**: 🟡 Awaiting admin confirm (§14 Open Questions).
**Approver**: admin (golf)
**Next step**: confirm § 14 → write strategy file → backtest.
