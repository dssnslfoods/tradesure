import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { analyzeCryptoSignal } from "@/lib/ai/analyzeCryptoSignal";
import { getScheduleConfig } from "@/lib/schedule/settings";
import { isCurrentUserAdmin } from "@/lib/auth/guards";
import {
  broadcastTelegramMessage,
  buildTelegramMessage,
} from "@/lib/telegram/sendTelegramMessage";
import type { TradingViewPayload } from "@/types/signal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MIN_CONFIDENCE = Number(process.env.MIN_CONFIDENCE ?? 70);
const BLOCKED_HOURS = (process.env.BLOCKED_HOURS ?? "13,14,16,17,20")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n >= 0 && n <= 23);

function bangkokHour(t: string | number | null | undefined): number | null {
  if (t === undefined || t === null || t === "") return null;
  const ms = typeof t === "number" ? t : Number(t);
  const d = Number.isFinite(ms) ? new Date(ms) : new Date(String(t));
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const h = parts.find((p) => p.type === "hour")?.value;
  const n = Number(h);
  return Number.isFinite(n) ? n : null;
}

interface QueuedRow {
  id: string;
  signal_id: string;
  symbol: string;
  interval: string;
  tradingview_signals: {
    raw_payload: TradingViewPayload | null;
  } | null;
}

/**
 * Admin-only endpoint that runs the AI analysis pipeline against every
 * ai_signal_analysis row with outcome="QUEUED". For each row we:
 *   1) Reconstruct the original webhook payload from tradingview_signals.raw_payload
 *   2) Call analyzeCryptoSignal()
 *   3) Apply the same post-filter (confidence >= MIN_CONFIDENCE, blocked hour)
 *   4) Update the row with bias/levels/outcome
 *   5) Broadcast Telegram for actionable signals (PENDING outcomes)
 *
 * Respects a `limit` query param (default 25, max 100) so a single batch
 * stays within the 60s function timeout even with slow OpenAI responses.
 */
export async function POST(req: NextRequest) {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
  }

  const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? 25);
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(limitParam, 1), 100)
    : 25;
  const sendTelegram = req.nextUrl.searchParams.get("telegram") !== "0";

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ai_signal_analysis")
    .select(
      `id, signal_id, symbol, interval,
       tradingview_signals:signal_id ( raw_payload )`
    )
    .eq("outcome", "QUEUED")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    return NextResponse.json(
      { ok: false, error: `Queue query failed: ${error.message}` },
      { status: 500 }
    );
  }

  const rows = (data ?? []) as unknown as QueuedRow[];
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, message: "queue is empty" });
  }

  // Honor admin-selected model for the whole batch.
  let modelId: string | undefined;
  try {
    modelId = (await getScheduleConfig()).ai_model;
  } catch {
    // Analyzer falls back to its own default if unset.
  }

  let processed = 0;
  let filtered = 0;
  let telegrams = 0;
  let errors = 0;
  const results: Array<{ id: string; outcome: string; error?: string }> = [];

  for (const row of rows) {
    const payload = row.tradingview_signals?.raw_payload;
    if (!payload) {
      await supabase
        .from("ai_signal_analysis")
        .update({
          outcome: "ERROR",
          reasoning_th: "[BATCH] Could not find original webhook payload",
        })
        .eq("id", row.id);
      errors++;
      results.push({ id: row.id, outcome: "ERROR", error: "missing payload" });
      continue;
    }

    let aiResult;
    let aiRaw: unknown = null;
    try {
      const out = await analyzeCryptoSignal(payload, modelId);
      aiResult = out.result;
      aiRaw = out.raw;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      await supabase
        .from("ai_signal_analysis")
        .update({ outcome: "ERROR", reasoning_th: `[BATCH] AI error: ${msg}` })
        .eq("id", row.id);
      errors++;
      results.push({ id: row.id, outcome: "ERROR", error: msg });
      continue;
    }

    // Re-apply post-filter (same logic as live webhook)
    let outcome: "PENDING" | "SKIP_WAIT" | "SKIP_LOW_CONF" | "SKIP_HOUR" = "PENDING";
    let filterReason: string | null = null;
    const bkkHour = bangkokHour(payload.time as string | number);

    if (aiResult.bias === "WAIT") {
      outcome = "SKIP_WAIT";
    } else if (bkkHour !== null && BLOCKED_HOURS.includes(bkkHour)) {
      outcome = "SKIP_HOUR";
      filterReason = `Blocked hour ${String(bkkHour).padStart(2, "0")}:00 (BKK)`;
    } else if (aiResult.confidence < MIN_CONFIDENCE) {
      outcome = "SKIP_LOW_CONF";
      filterReason = `AI confidence ${aiResult.confidence}% < threshold ${MIN_CONFIDENCE}%`;
    }

    const reasoning = filterReason
      ? `[BATCH-FILTERED: ${filterReason}] ${aiResult.reasoning_th}`
      : `[BATCH] ${aiResult.reasoning_th}`;

    await supabase
      .from("ai_signal_analysis")
      .update({
        bias: aiResult.bias,
        confidence: aiResult.confidence,
        entry_zone: aiResult.entry_zone,
        entry_low: aiResult.entry_low,
        entry_high: aiResult.entry_high,
        stop_loss: aiResult.stop_loss,
        stop_loss_num: aiResult.stop_loss_num,
        take_profit_1: aiResult.take_profit_1,
        take_profit_1_num: aiResult.take_profit_1_num,
        take_profit_2: aiResult.take_profit_2,
        take_profit_2_num: aiResult.take_profit_2_num,
        risk_level: aiResult.risk_level,
        summary_th: aiResult.summary_th,
        reasoning_th: reasoning,
        ai_raw_response: aiRaw,
        outcome,
      })
      .eq("id", row.id);

    processed++;
    if (outcome !== "PENDING") filtered++;

    if (sendTelegram && outcome === "PENDING") {
      try {
        const msg = buildTelegramMessage(payload, aiResult);
        const tg = await broadcastTelegramMessage(msg);
        if (tg.ok) {
          await supabase
            .from("ai_signal_analysis")
            .update({ telegram_sent: true })
            .eq("id", row.id);
          telegrams++;
        }
      } catch (err) {
        console.error("[process-queued] telegram failed:", err);
      }
    }

    results.push({ id: row.id, outcome });
  }

  return NextResponse.json({
    ok: true,
    processed,
    filtered,
    telegrams_sent: telegrams,
    errors,
    remaining_estimate: rows.length === limit ? "more — re-run to drain" : 0,
    results,
  });
}

// Convenience GET for testing — same behavior as POST.
export async function GET(req: NextRequest) {
  return POST(req);
}
