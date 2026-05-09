# Deploy to Firebase App Hosting

Project ID: **tradesure-800aa**
Backend ID: **crypto-ai-signal**

Firebase App Hosting runs Next.js (SSR + API routes) on Cloud Run behind the
Firebase CDN. It connects to a GitHub repo and rebuilds on every push.

---

## 0. Prerequisites

```bash
npm i -g firebase-tools
firebase login
gcloud auth login                                  # for Secret Manager
gcloud config set project tradesure-800aa
```

You also need the Firebase project on the **Blaze (pay-as-you-go) plan** —
App Hosting cannot run on the free Spark plan. Upgrade at
<https://console.firebase.google.com/project/tradesure-800aa/usage/details>.

Enable the required APIs once:

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  apphosting.googleapis.com \
  --project tradesure-800aa
```

---

## 1. Push the project to GitHub

App Hosting deploys from a Git repository.

```bash
cd /Users/golf/Desktop/Projects/signal_trade
git init
git add .
git commit -m "Initial commit"
gh repo create crypto-ai-signal-webhook --private --source=. --push
# (or create the repo manually on github.com and `git push -u origin main`)
```

> ⚠️ `.env.local` is in `.gitignore` so secrets won't be committed.
> Secrets are pushed to Google Secret Manager separately (step 3).

---

## 2. Create the App Hosting backend

```bash
firebase apphosting:backends:create \
  --project tradesure-800aa \
  --location asia-southeast1
```

The CLI will prompt for:
- Backend ID → `crypto-ai-signal`
- GitHub repo → choose `crypto-ai-signal-webhook` you just pushed
- Branch → `main`
- Root directory → `/`

(You can also do this in the Firebase Console:
<https://console.firebase.google.com/project/tradesure-800aa/apphosting>.)

---

## 3. Upload secrets to Secret Manager

The repository ships with a helper script that reads `.env.local` and pushes
each value into Google Secret Manager:

```bash
./scripts/firebase-secrets.sh
```

Then grant the App Hosting backend permission to read each secret:

```bash
for s in SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY OPENAI_API_KEY \
         TRADINGVIEW_WEBHOOK_SECRET TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID; do
  firebase apphosting:secrets:grantaccess "$s" \
    --backend crypto-ai-signal \
    --project tradesure-800aa
done
```

The mapping between env-var names and Secret Manager names is defined in
[`apphosting.yaml`](apphosting.yaml).

---

## 4. Deploy

App Hosting auto-deploys on every push to the connected branch:

```bash
git push origin main
```

To trigger a manual rollout from the CLI:

```bash
firebase apphosting:rollouts:create crypto-ai-signal --project tradesure-800aa
```

Watch progress at
<https://console.firebase.google.com/project/tradesure-800aa/apphosting>.

---

## 5. Get the production URL

After the first rollout finishes, your URLs are:

| Path | URL |
|---|---|
| Landing | `https://crypto-ai-signal--tradesure-800aa.<region>.hosted.app` |
| Dashboard | `…/dashboard` |
| Webhook | `…/api/webhook/tradingview` |

(The Firebase Console shows the exact hosted-app domain.)

You can also bind a custom domain from
**App Hosting → Backends → crypto-ai-signal → Settings → Custom domain**.

---

## 6. Point TradingView at the new URL

In TradingView → Edit Alert → **Webhook URL**:

```
https://<your-app-hosting-domain>/api/webhook/tradingview
```

Message body stays the same — see
[`scripts/tradingview-alert-template.json`](scripts/tradingview-alert-template.json).

---

## 7. Smoke-test the deployed webhook

```bash
URL=https://<your-app-hosting-domain> \
SECRET=btc_ai_secret_2026_x7k29pQ \
./scripts/test-webhook.sh
```

Expected: JSON response with `"ok": true` plus a Thai analysis message landing
in the Telegram chat (chat_id 5398471877).

---

## Updating env vars later

- **Public values** (e.g. Supabase URL): edit `apphosting.yaml`, commit, push.
- **Secrets** (API keys, tokens): re-run `./scripts/firebase-secrets.sh` then
  trigger a rollout. App Hosting only picks up new secret versions on rollout.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Billing must be enabled` | Upgrade project to Blaze plan |
| `Permission denied: Secret Manager` | Run the `grantaccess` loop in step 3 |
| Build fails on `npm install` | App Hosting uses Node 20; project is compatible |
| `secret not found` at runtime | Secret name in `apphosting.yaml` doesn't match Secret Manager |
| 401 from webhook | `TRADINGVIEW_WEBHOOK_SECRET` mismatch between server + alert body |
