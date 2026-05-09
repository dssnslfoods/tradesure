# Crypto AI Signal Webhook

Production-ready Next.js webhook receiver that replaces n8n for TradingView → AI → Telegram pipelines.

```
TradingView Alert  ──►  /api/webhook/tradingview
                            │
                            ├─► Validate secret + payload
                            ├─► Insert into Supabase (tradingview_signals)
                            ├─► OpenAI structured analysis (Thai)
                            ├─► Insert into Supabase (ai_signal_analysis)
                            └─► Push formatted Thai message to Telegram
```

## Tech Stack
- Next.js 14 (App Router) + TypeScript
- Tailwind CSS (dark crypto-style dashboard)
- Supabase PostgreSQL (server-side service-role client)
- OpenAI Chat Completions (JSON mode)
- Telegram Bot API
- Deployable on Vercel

---

## 1. Install & run locally

```bash
npm install
cp .env.example .env.local   # then fill in values
npm run dev
```

Open <http://localhost:3000/dashboard>.

## 2. Environment variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini          # optional, default gpt-4o-mini
TRADINGVIEW_WEBHOOK_SECRET=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

> ⚠️ Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser. It's only read server-side inside `lib/supabase/server.ts`.

## 3. Configure Supabase

1. Create a project at <https://supabase.com>.
2. Open **SQL editor** and run the migration in
   `supabase/migrations/001_create_crypto_signal_tables.sql`.
3. Copy the project URL, anon key, and service-role key into `.env.local`.

The migration creates two tables:
- `tradingview_signals` — raw incoming alerts
- `ai_signal_analysis` — structured AI output + Telegram delivery status

## 4. Create a Telegram bot

1. Talk to **@BotFather** in Telegram → `/newbot` → follow prompts.
2. Copy the bot token into `TELEGRAM_BOT_TOKEN`.
3. Get the chat ID:
   - Add the bot to your group/channel (or DM it).
   - Send a test message.
   - Visit `https://api.telegram.org/bot<TOKEN>/getUpdates`.
   - Copy the `chat.id` value into `TELEGRAM_CHAT_ID`.
   - For private chats it's a number; for groups it starts with `-100…`.

## 5. Configure TradingView alerts

1. Open the desired chart and create an alert.
2. **Webhook URL:**
   ```
   https://your-domain.com/api/webhook/tradingview
   ```
3. **Message** (paste this JSON template — TradingView will substitute placeholders):
   ```json
   {
     "secret": "YOUR_SECRET_KEY",
     "symbol": "{{ticker}}",
     "exchange": "{{exchange}}",
     "interval": "{{interval}}",
     "price": "{{close}}",
     "time": "{{timenow}}",
     "signal": "{{strategy.order.action}}",
     "strategy": "EMA_RSI_BTC",
     "rsi": "{{plot_0}}",
     "ema_fast": "{{plot_1}}",
     "ema_slow": "{{plot_2}}",
     "note": "BTC breakout signal"
   }
   ```
4. Make sure `secret` matches `TRADINGVIEW_WEBHOOK_SECRET`.

## 6. Test the webhook with curl

```bash
curl -X POST http://localhost:3000/api/webhook/tradingview \
  -H "Content-Type: application/json" \
  -d '{
    "secret": "change-me-to-a-strong-secret",
    "symbol": "BTCUSDT",
    "exchange": "BINANCE",
    "interval": "15m",
    "price": "65000",
    "time": "2026-05-09T10:00:00Z",
    "signal": "BUY",
    "strategy": "EMA_RSI_BTC",
    "rsi": "58",
    "ema_fast": "64800",
    "ema_slow": "64200",
    "note": "BTC breakout signal"
  }'
```

Successful response:
```json
{
  "ok": true,
  "signal_id": "…",
  "analysis_id": "…",
  "telegram_sent": true
}
```

## 7. Dashboard

Visit `/dashboard` for a dark, responsive table of the last 100 signals with
colored badges for LONG / SHORT / WAIT and Low / Medium / High risk.

## 8. Deploy to Vercel

```bash
npm i -g vercel
vercel
```

Or push to GitHub and import the repo at <https://vercel.com/new>.
After deployment:

1. In **Project → Settings → Environment Variables**, add every key from
   `.env.example`.
2. Redeploy.
3. Use `https://<your-project>.vercel.app/api/webhook/tradingview` in TradingView.

## 9. Project layout

```
app/
  api/webhook/tradingview/route.ts   # Webhook handler
  dashboard/page.tsx                 # Dark dashboard UI
  page.tsx                           # Landing page
  layout.tsx
  globals.css
lib/
  supabase/server.ts                 # Server-only Supabase client
  ai/analyzeCryptoSignal.ts          # OpenAI structured analysis (Thai)
  telegram/sendTelegramMessage.ts    # Telegram Bot API + Thai formatter
types/
  signal.ts                          # Shared TypeScript types
supabase/
  migrations/001_create_crypto_signal_tables.sql
```

## 10. Error behavior

| Failure                 | Behavior                                                    |
|-------------------------|-------------------------------------------------------------|
| Invalid `secret`        | `401 { ok:false, error:"Unauthorized" }`                    |
| Missing required field  | `400 { ok:false, error:"Missing required fields: …" }`      |
| Supabase insert fails   | `500` with the Supabase error message                       |
| OpenAI API fails        | Signal already saved; returns `502` with reason             |
| Telegram API fails      | Analysis saved; `telegram_sent: false` returned + persisted |

The app never crashes on third-party failure — every external call is isolated
with explicit error handling.
