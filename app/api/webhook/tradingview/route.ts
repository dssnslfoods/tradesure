import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  broadcastTelegramMessage,
  buildNoTradeMessage,
} from "@/lib/telegram/sendTelegramMessage";
import type { TradingViewPayload } from "@/types/signal";

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

  // ─── NO_TRADE fast path ──────────────────────────────────────────────────
  // Pine fires this every confirmed bar when neither LONG nor SHORT setup is
  // valid. We skip AI + DB storage and just notify Telegram so users know the
  // bot is alive and *why* it stayed flat. Suppression via NOTRADE_TELEGRAM=0.
  if (String(payload.signal).toUpperCase() === "NO_TRADE") {
    const noTradeOn = (process.env.NOTRADE_TELEGRAM ?? "1") !== "0";
    if (noTradeOn) {
      const msg = buildNoTradeMessage(payload);
      // Fire-and-forget so we respond to TradingView in <3s
      void broadcastTelegramMessage(msg).catch((err) => {
        console.error("[webhook] no-trade Telegram send failed:", err);
      });
    }
    return NextResponse.json({ ok: true, no_trade: true });
  }

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
