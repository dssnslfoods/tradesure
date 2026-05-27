import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Unified automation tick — guarantees every TradingView alert ends up tracked
// with a resolved outcome, with no manual button-pressing:
//
//   1. Drain QUEUED signals  → /api/admin/process-queued (runs AI, → PENDING)
//   2. Resolve PENDING/OPEN  → /api/backtest/run (→ WIN/LOSS/OPEN via Binance)
//
// Secured by BACKTEST_CRON_SECRET. Call it from a scheduler (GitHub Actions /
// Cloud Scheduler) every ~15 min:
//   curl -X POST "https://tradesure.d2infinite.com/api/cron/tick?secret=<SECRET>"
//
// Both internal calls forward the same secret. Failures in one step don't
// abort the other — we report both results.

function authorize(req: NextRequest): boolean {
  const expected = process.env.BACKTEST_CRON_SECRET;
  if (!expected) return false;
  const got =
    req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  return got === expected;
}

export async function GET(req: NextRequest) {
  // Allow GET too — some schedulers only do GET. Same auth.
  return run(req);
}

export async function POST(req: NextRequest) {
  return run(req);
}

async function run(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const secret = process.env.BACKTEST_CRON_SECRET ?? "";
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.URL ??
    new URL(req.url).origin;

  // Tunables via query (sane defaults)
  const queueLimit = Math.min(
    Math.max(Number(req.nextUrl.searchParams.get("queue_limit") ?? 100), 1),
    100
  );
  const btLimit = Math.min(
    Math.max(Number(req.nextUrl.searchParams.get("bt_limit") ?? 200), 1),
    500
  );

  const out: Record<string, unknown> = { ok: true, ranAt: new Date().toISOString() };

  // ── Step 1: drain QUEUED → PENDING (best-effort) ──
  try {
    const r = await fetch(
      `${base}/api/admin/process-queued?limit=${queueLimit}&secret=${encodeURIComponent(secret)}`,
      { method: "POST", cache: "no-store", headers: { "x-cron-secret": secret } }
    );
    out.process_queued = await r.json().catch(() => ({ ok: false }));
  } catch (err) {
    out.process_queued = { ok: false, error: err instanceof Error ? err.message : "fetch failed" };
  }

  // ── Step 2: resolve PENDING/OPEN → WIN/LOSS/OPEN ──
  try {
    const r = await fetch(
      `${base}/api/backtest/run?limit=${btLimit}&trigger=cron`,
      { method: "POST", cache: "no-store", headers: { "x-cron-secret": secret } }
    );
    out.backtest = await r.json().catch(() => ({ ok: false }));
  } catch (err) {
    out.backtest = { ok: false, error: err instanceof Error ? err.message : "fetch failed" };
  }

  return NextResponse.json(out);
}
