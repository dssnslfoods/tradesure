#!/usr/bin/env bash
# Push all .env.local secrets into Google Secret Manager so Firebase App Hosting can use them.
#
# Prerequisites:
#   - gcloud CLI logged in (`gcloud auth login`)
#   - firebase CLI logged in (`firebase login`)
#   - Project tradesure-800aa is on the Blaze plan
#   - Secret Manager API enabled
#
# Usage:
#   chmod +x scripts/firebase-secrets.sh
#   ./scripts/firebase-secrets.sh

set -euo pipefail

PROJECT_ID="tradesure-800aa"

if [ ! -f .env.local ]; then
  echo "ERROR: .env.local not found"
  exit 1
fi

# shellcheck disable=SC1091
set -a; source .env.local; set +a

put_secret() {
  local name="$1"
  local value="$2"
  if [ -z "${value:-}" ]; then
    echo "skip ${name} (empty)"
    return
  fi
  echo "→ ${name}"
  printf "%s" "$value" | firebase apphosting:secrets:set "$name" \
    --project "$PROJECT_ID" \
    --data-file - \
    --force
}

put_secret SUPABASE_ANON_KEY          "${NEXT_PUBLIC_SUPABASE_ANON_KEY}"
put_secret SUPABASE_SERVICE_ROLE_KEY  "${SUPABASE_SERVICE_ROLE_KEY}"
put_secret OPENAI_API_KEY             "${OPENAI_API_KEY}"
put_secret TRADINGVIEW_WEBHOOK_SECRET "${TRADINGVIEW_WEBHOOK_SECRET}"
put_secret TELEGRAM_BOT_TOKEN         "${TELEGRAM_BOT_TOKEN}"
put_secret TELEGRAM_CHAT_ID           "${TELEGRAM_CHAT_ID}"

echo
echo "Secrets uploaded. Now grant App Hosting access to each secret:"
echo "  firebase apphosting:secrets:grantaccess SUPABASE_ANON_KEY --backend crypto-ai-signal --project ${PROJECT_ID}"
echo "  (repeat for each secret name above)"
