import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { isTradingPlanActive, getTradingPlansCatalog } from "@/lib/schedule/settings";
import type { TradingPlan, TradingViewPayload } from "@/types/signal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REQUIRED_FIELDS = ["symbol", "interval", "price", "signal", "time"] as const;

function badRequest(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "TradingView webhook endpoint. Use POST.",
  });
}

// Fast public webhook: validates + persists raw signal, then fires the heavy
// AI/Telegram pipeline as a fire-and-forget request to /api/webhook/process so
// we can reply to TradingView well within its ~3s timeout.
export async function POST(req: NextRequest) {
  let payload: TradingViewPayload;
  try {
    payload = (await req.json()) as TradingViewPayload;
  } catch {
    return badRequest("Invalid JSON body");
  }

  const expectedSecret = process.env.TRADINGVIEW_WEBHOOK_SECRET;
  if (!expectedSecret) {
    return badRequest("Server missing TRADINGVIEW_WEBHOOK_SECRET", 500);
  }
  if (!payload || payload.secret !== expectedSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const missing = REQUIRED_FIELDS.filter(
    (k) => payload[k] === undefined || payload[k] === null || payload[k] === ""
  );
  if (missing.length) {
    return badRequest(`Missing required fields: ${missing.join(", ")}`);
  }

  // ─── Trading-plan filter ─────────────────────────────────────────────────
  // Each indicator tags its payload with signal_type — admin-defined string
  // matching a TradingPlanDef.key in the catalog. Validate against catalog
  // (unknown_plan reject for typo safety), then against active list
  // (plan_inactive reject for admin opt-out). Missing signal_type → "swing"
  // for backwards compat with pre-Phase-1a Pine v2.1 alerts.
  const rawType = typeof payload.signal_type === "string" ? payload.signal_type.trim() : "";
  const catalog = await getTradingPlansCatalog().catch(() => []);
  const knownKeys = catalog.map((p) => p.key);
  const planType: TradingPlan = rawType.length > 0 ? rawType : "swing";

  if (rawType.length > 0 && knownKeys.length > 0 && !knownKeys.includes(rawType)) {
    return NextResponse.json({
      ok: true,
      rejected: "unknown_plan",
      plan: rawType,
      hint: "signal_type is not in trading_plans_catalog — admin add it via /dashboard/schedule",
    });
  }
  if (!(await isTradingPlanActive(planType))) {
    return NextResponse.json({
      ok: true,
      rejected: "plan_inactive",
      plan: planType,
    });
  }

  // Phase 2 (2026-05-16): NO_TRADE no longer has a fast-path bypass —
  // we let it flow through the same AI analysis pipeline so the system
  // can track "what would the AI have decided when Pine said wait?"
  // for confidence-bucket stats. The AI prompt picks a direction and
  // marks recommended=false because Pine flagged NO_TRADE. If admin
  // wants to suppress the resulting Telegram message, set env
  // NOTIFY_NOT_RECOMMENDED=0 (covers all not-recommended signals).

  const supabase = getSupabaseAdmin();

  const priceNum = Number(payload.price);
  const { secret: _secret, ...rawForStorage } = payload;
  void _secret;

  const { data: signalRow, error: signalErr } = await supabase
    .from("tradingview_signals")
    .insert({
      symbol: payload.symbol,
      exchange: payload.exchange ?? null,
      interval: payload.interval,
      price: Number.isFinite(priceNum) ? priceNum : null,
      signal: payload.signal,
      strategy: payload.strategy ?? null,
      signal_type: planType,
      raw_payload: rawForStorage,
    })
    .select("id")
    .single();

  if (signalErr || !signalRow) {
    return NextResponse.json(
      { ok: false, error: `Supabase insert failed: ${signalErr?.message ?? "unknown"}` },
      { status: 500 }
    );
  }

  const signalId = signalRow.id as string;

  // Fire-and-forget: kick off heavy AI/Telegram processing on a separate
  // request so this response returns to TradingView within its timeout.
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.URL ??
    new URL(req.url).origin;

  // Don't await — but keep a reference so node doesn't garbage-collect
  // before the request leaves the box. Using `keepalive: true` so the
  // request completes even after the response is flushed.
  void fetch(`${baseUrl}/api/webhook/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      signal_id: signalId,
      payload,
      secret: expectedSecret,
    }),
    keepalive: true,
    cache: "no-store",
  }).catch((err) => {
    // Best-effort: log but don't fail the webhook
    console.error("[webhook] process dispatch failed:", err);
  });

  return NextResponse.json({
    ok: true,
    signal_id: signalId,
    queued: true,
  });
}
