#!/usr/bin/env bash
# Quick local test for the TradingView webhook.
#
# Usage:
#   chmod +x scripts/test-webhook.sh
#   ./scripts/test-webhook.sh                       # uses http://localhost:3000
#   URL=https://your-domain.com ./scripts/test-webhook.sh
#   SECRET=mysecret ./scripts/test-webhook.sh

set -euo pipefail

URL="${URL:-http://localhost:3000}"
SECRET="${SECRET:-${TRADINGVIEW_WEBHOOK_SECRET:-change-me-to-a-strong-secret}}"

curl -sS -X POST "$URL/api/webhook/tradingview" \
  -H "Content-Type: application/json" \
  -d "$(cat <<JSON
{
  "secret": "$SECRET",
  "symbol": "BTCUSDT",
  "exchange": "BINANCE",
  "interval": "15m",
  "price": "65000",
  "time": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "signal": "BUY",
  "strategy": "EMA_RSI_BTC",
  "rsi": "58",
  "ema_fast": "64800",
  "ema_slow": "64200",
  "note": "BTC breakout signal (test)"
}
JSON
)" | jq . 2>/dev/null || true
echo
