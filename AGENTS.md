# AGENTS.md — Tradesure by D2infinite

> Onboarding doc for AI coding agents (Claude Code, etc.) working on the Tradesure crypto signal system.
> Read this **before** making changes. It encodes hard-won decisions and traps to avoid.

---

## 1. What is this project?

**Tradesure** is a production crypto trading-signal system that runs the pipeline:

```
TradingView (Pine v2.1)  →  Webhook  →  AI veto (OpenAI / Gemini)  →  Telegram
                                              ↓
                                          Supabase  ←→  Next.js Dashboard
```

- **Live URL**: `https://tradesure.d2infinite.com`
- **Hosting**: Firebase App Hosting (backend `crypto-ai-signal`, project `tradesure-800aa`)
- **Repo**: `main` branch auto-deploys via App Hosting on push.
- **Audience**: paid subscribers; admin = "golf" / D2infinite team.

The system does **not** execute trades. It produces BUY / SELL / NO_TRADE signals with SL/TP1/TP2 levels, run through an AI quality gate, then broadcasts to Telegram and the web dashboard.

---

## 2. Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind, Server Components + Server Actions |
| DB / Auth | Supabase (Postgres + service-role admin client) |
| AI | OpenAI Chat Completions (JSON mode) + Google Gemini REST |
| Signal source | TradingView Pine Script v6 (indicator + strategy) |
| Notifications | Telegram Bot API |
| Hosting | Firebase App Hosting (backend ID `crypto-ai-signal`) |
| Market context | alternative.me (F&G), CoinGecko (BTC.D), Binance (funding) |

Node modules: `@supabase/supabase-js`, `openai`. **No** ORM, no tRPC, no Zod (yet). Validation is hand-rolled at boundaries.

---

## 3. Repo layout

```
app/
  api/
    webhook/tradingview     ← Pine alert hits here (entry point)
    webhook/process         ← internal queue processor
    admin/                  ← admin-only actions (broadcast-test, process-queued)
    backtest/               ← Pine strategy backtest endpoints
    schedule/               ← AI active-schedule CRUD
    telegram/               ← telegram send + commands
    notifications/, trending/, auth/
  dashboard/                ← all authenticated pages (Server Components)
    SignalsTable.tsx        ← main signal table + filters (outcome + symbol)
    help/HelpClient.tsx     ← user-facing guides
  login/, layout.tsx, page.tsx
components/
  layout/                   ← Sidebar (desktop), Topbar, BottomNav (mobile)
  ui/                       ← shared primitives
lib/
  ai/                       ← OpenAI + Gemini wrappers, prompt builder, models.ts
  analytics/, auth/, backtest/, binance/, curated/, market/
  schedule/settings.ts      ← AI active-schedule logic (multi-window + DoW)
  supabase/server.ts        ← service-role + RLS clients
  telegram/sendTelegramMessage.ts  ← formatters incl. buildConfigBroadcastMessage
pine/
  btc_futures_signal_v2.pine     ← LIVE indicator (v2.1, Daily EMA200 filter)
  btc_futures_strategy_v1.pine   ← BACKTEST strategy (v1.3 Day Trader)
supabase/migrations/        ← SQL migrations (apply via Supabase MCP / dashboard)
```

---

## 4. Pine files — DO NOT confuse them

| File | Type | Purpose | Plan tag |
|---|---|---|---|
| `pine/btc_futures_signal_v2.pine` | `indicator()` v2.1.1 | **Live** — fires `alert()` JSON payloads to webhook | `swing` |
| `pine/btc_futures_strategy_v1.pine` | `strategy()` v1.3 | **Backtest only** — Strategy Tester for swing | swing |
| `pine/btc_futures_strategy_v3.pine` | `strategy()` v3 | **Backtest only — ABORTED** | intraday (would-be) |
| `pine/v3_design.md` + `v3_backtest_results.md` | docs | Design + post-mortem for the intraday attempt | — |

**v2.1.1 + v1.3 share the same trading logic** (EMA crosses, ADX, ATR-based SL/TP). Strategy mirrors indicator so backtest results approximate live performance.

The live indicator is **symbol-agnostic**: uses `syminfo.ticker` + `request.security(syminfo.tickerid, "D", …)`. One Pine code, N TradingView alerts (one per symbol+TF). All alerts point to `/api/webhook/tradingview`.

**v3 intraday status**: 🛑 Phase 3-4 aborted 2026-05-14 after 7 backtest variants all failed acceptance (PF ceiling ~0.75, target ≥1.1). See `pine/v3_backtest_results.md`. Multi-plan infrastructure (Phase 1a+1b) is preserved — admin can re-enable `intraday` plan via dashboard if/when a redesigned v3 ships. Default is now `active_trading_plans: ["swing"]`.

---

## 5. Signal pipeline (read carefully before touching)

1. **Pine fires** `alert()` with a JSON payload (BUY / SELL / NO_TRADE + symbol, price, SL, TP1, TP2, reason codes).
2. **`/api/webhook/tradingview`** validates and inserts into `signals` table with status `QUEUED`.
3. **AI active schedule** (`lib/schedule/settings.ts`) decides if AI should run *now*:
   - If outside active windows / wrong day-of-week → leave as `QUEUED`.
   - If inside window → call AI immediately.
4. **Batch processor** (`/api/admin/process-queued`) drains `QUEUED` rows when schedule opens. Triggered by cron or manual button.
5. **AI veto** (`lib/ai/analyzeCryptoSignal.ts`):
   - Builds prompt with F&G, BTC.D, funding rate, Daily-trend context.
   - Calls OpenAI **and/or** Gemini per admin config. Compare mode runs both.
   - Returns `{decision, confidence, rationale}`. AI can downgrade BUY/SELL → WAIT.
6. **Telegram broadcast** (`lib/telegram/sendTelegramMessage.ts`) if AI greenlights or signal is NO_TRADE heartbeat.
7. **Outcome tracking** — first-touch model (TP1 → TP2 chain or SL). Outcomes: `WIN_TP1`, `WIN_TP2`, `LOSS_SL`, `OPEN`, `EXPIRED`, `NO_TRADE`, `QUEUED`.

**Multi-symbol** is fully supported end-to-end. Dashboard shows symbol filter chips when ≥2 symbols exist.

---

## 6. Database (Supabase)

Service-role client in `lib/supabase/server.ts`. Use it for admin endpoints. RLS is enforced on user-facing reads.

Core tables (apply migrations from `supabase/migrations/`):
- `signals` — every alert, with outcome + AI decision + payload
- `users` — auth + `is_admin` flag
- `app_settings` — key-value JSON for runtime config (schedule, AI mode, API keys, models)
- backtest run history, schedule windows, etc.

**Never** commit API keys. AI keys live in `app_settings` (admin UI manages them, masked when displayed).

---

## 7. Critical past mistakes (don't repeat)

| Bug | Symptom | Root cause | Fix |
|---|---|---|---|
| Strategy v1.0 → 0 closed trades over 16 months | Backtest stuck "open" | `strategy.exit(qty_percent=50, limit, stop)` left positions hanging | Replaced with `strategy.close()` + manual OHLC price checks (v1.1+) |
| Pine v1.2 → 0 trades | Regime filters too strict | BB-width 3% threshold too high for 1H BTC | v1.2.2 turns regime filters OFF by default |
| Pine v6 compile error CE10156 | Backtest broken | `or` at end of line in multi-line bool expr | Split into named intermediates (`regimeBlockDaily`, etc.) |
| Margin calls in Strategy Tester | Account blown up | TV default order size = "100 Quantity" (= $8M position) | Use TV Properties → Default order size **25 % of equity** |
| "Disable LONG permanently" recommendation | Bad UX — too rigid | User correctly pushed back | Daily EMA200 regime filter instead (v2.1) — adaptive, not permanent |
| Webhook payload had wrong symbol field | Multi-symbol broken | Hard-coded "BTCUSDT" | Use `syminfo.ticker` in Pine |

---

## 8. Conventions

- **Server Components by default**; only mark `"use client"` when state/handlers needed.
- **Server Actions** for mutations; do not invent REST endpoints unless cron / external caller needs it.
- **Tailwind only** — no CSS modules, no styled-components. Custom tokens in `tailwind.config.ts` (`ink-muted`, `bg-grid`, `tracking-eyebrow`, etc.).
- **Thai UI strings** are first-class. New UI labels usually need Thai copy.
- **Time** is stored UTC, displayed Asia/Bangkok (UTC+7). When saving relative dates from user ("Thursday"), resolve to absolute.
- **No new docs files** unless explicitly asked. Help content goes in `app/dashboard/help/HelpClient.tsx`.

---

## 9. Deploy & operations

- **Push to `main`** → Firebase App Hosting auto-rolls a new revision.
- Manual rollout: `firebase apphosting:rollouts:create crypto-ai-signal --git-branch main --force`
- Console: https://console.firebase.google.com/project/tradesure-800aa/apphosting
- App Hosting build runs `next build`. Env vars are managed in `apphosting.yaml` + Firebase console (secrets).
- **Migrations are not auto-applied.** Use Supabase MCP `apply_migration` or run via dashboard SQL editor.

---

## 10. Admin features (so you know what exists)

- **Multi-AI mode**: pick OpenAI, Gemini, or compare-both
- **AI active schedule**: multi-window + day-of-week, with QUEUED batching
- **View Configuration modal**: read-only snapshot of all runtime config (also sent as "test broadcast" to all users)
- **Recent backtest runs**: capped at 10
- **Mobile BottomNav**: persistent role-based menu on `< lg` screens
- **Symbol filter chips** on Signals table: visible when ≥2 symbols, shows count + win rate per symbol
- **Outcome filter chips**: WIN_TP1 / WIN_TP2 / LOSS_SL / OPEN / EXPIRED / NO_TRADE / QUEUED — composes with symbol filter (intersect)

---

## 11. When working on this repo

**Before code changes:**
1. Read the touched files fully — many are large (HelpClient, SignalsTable, sendTelegramMessage, pine files).
2. If touching Pine, confirm whether it's indicator (live) or strategy (backtest).
3. If touching the signal pipeline, trace it end-to-end mentally: Pine → webhook → DB → schedule → AI → Telegram → dashboard.
4. If touching DB schema, write a migration in `supabase/migrations/` — do not mutate prod via dashboard ad-hoc.

**After code changes:**
1. `npm run build` locally to catch type errors (no test suite exists yet).
2. Commit with descriptive message + Co-Authored-By Claude.
3. Push to `main` only when user asks. App Hosting deploys automatically.
4. For manual deploy: `firebase apphosting:rollouts:create crypto-ai-signal --git-branch main --force`.

**Never:**
- Execute or recommend executing real trades.
- Commit `.env*` files or any API key.
- Add tests / linters / new dependencies without asking.
- Write large `*.md` docs unless requested.
- Use `git push --force` to `main`.
- Skip pre-commit hooks (`--no-verify`).
- Recommend "disable LONG/SHORT permanently" — prefer adaptive filters (Daily EMA200 regime gate).

---

## 12. Quick reference — common tasks

| Task | Where to look |
|---|---|
| Change AI prompt | `lib/ai/analyzeCryptoSignal.ts` |
| Add a new market-context input to AI | `lib/market/`, then prompt builder |
| Adjust active schedule logic | `lib/schedule/settings.ts` |
| Add a Telegram message format | `lib/telegram/sendTelegramMessage.ts` |
| Tweak signal logic / SL-TP math | `pine/btc_futures_signal_v2.pine` (live) AND mirror in strategy file |
| Add dashboard column / filter | `app/dashboard/SignalsTable.tsx` |
| Update help content | `app/dashboard/help/HelpClient.tsx` |
| Add admin tool | `app/api/admin/<name>/route.ts` + UI in `app/dashboard/` |
| Change runtime config schema | `app_settings` row + migration + admin UI |

---

_Last updated: 2026-05-14 — keep this current when major architecture changes land._
