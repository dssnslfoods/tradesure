#!/usr/bin/env bash
# Send a realistic test signal to the webhook so the backtest engine has data.
#
# By default:
#   - URL=http://localhost:3000
#   - Signal time is backdated 3 hours so Binance klines exist after that point
#   - Price is fetched live from Binance for the chosen symbol
#
# Usage:
#   chmod +x scripts/test-webhook.sh
#   ./scripts/test-webhook.sh
#   URL=https://your-app.hosted.app ./scripts/test-webhook.sh
#   SECRET=mysecret SYMBOL=ETHUSDT TF=5m HOURS_BACK=1 ./scripts/test-webhook.sh

set -euo pipefail

URL="${URL:-http://localhost:3000}"
SECRET="${SECRET:-${TRADINGVIEW_WEBHOOK_SECRET:-change-me-to-a-strong-secret}}"
SYMBOL="${SYMBOL:-BTCUSDT}"
TF="${TF:-15m}"
SIGNAL_KIND="${SIGNAL_KIND:-BUY}"
HOURS_BACK="${HOURS_BACK:-3}"

PRICE=$(
  curl -sS "https://api.binance.com/api/v3/ticker/price?symbol=${SYMBOL}" |
    python3 -c "import json,sys; print(json.load(sys.stdin).get('price','0'))"
)
TIME_PAST=$(
  python3 -c "import datetime; print((datetime.datetime.utcnow() - datetime.timedelta(hours=${HOURS_BACK})).strftime('%Y-%m-%dT%H:%M:%SZ'))"
)

echo "→ Sending ${SIGNAL_KIND} ${SYMBOL} @ ${PRICE} (backdated ${HOURS_BACK}h to ${TIME_PAST}) to ${URL}"

curl -sS -X POST "$URL/api/webhook/tradingview" \
  -H "Content-Type: application/json" \
  -d "$(cat <<JSON
{
  "secret": "$SECRET",
  "symbol": "$SYMBOL",
  "exchange": "BINANCE",
  "interval": "$TF",
  "price": "$PRICE",
  "time": "$TIME_PAST",
  "signal": "$SIGNAL_KIND",
  "strategy": "EMA_RSI_BTC",
  "rsi": "58",
  "ema_fast": "$PRICE",
  "ema_slow": "$PRICE",
  "note": "Realistic backdated test"
}
JSON
)" | jq . 2>/dev/null || true
echo
