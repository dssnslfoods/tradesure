import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { analyzeCryptoSignal, analyzeDualModel } from "@/lib/ai/analyzeCryptoSignal";
import type { AIAnalysisResult } from "@/types/signal";
import {
  broadcastTelegramMessage,
  buildTelegramMessage,
} from "@/lib/telegram/sendTelegramMessage";
import {
  getScheduleConfig,
  isWithinAiSchedule,
} from "@/lib/schedule/settings";
import type { TradingViewPayload } from "@/types/signal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ── Quality gates applied *after* AI returns ───────────────────────────────
// Tunable via env so we can adjust without code deploy.
const MIN_CONFIDENCE = Number(process.env.MIN_CONFIDENCE ?? 70);
// Bangkok-local hours where historical win rate was < 40% — block these.
// Set BLOCKED_HOURS="" to disable. Default mirrors Pine v2 default list.
const BLOCKED_HOURS = (process.env.BLOCKED_HOURS ?? "13,14,16,17,20")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n >= 0 && n <= 23);

/**
 * Returns the hour-of-day in Asia/Bangkok for the signal's bar time. The
 * payload `time` field from Pine is a unix-ms string (UTC); we convert to
 * BKK so the filter lines up with our analytics heatmap.
 */
function bangkokHour(payload: TradingViewPayload): number | null {
  const raw = payload.time;
  if (raw === undefined || raw === null || raw === "") return null;
  const ms = typeof raw === "number" ? raw : Number(raw);
  const d = Number.isFinite(ms) ? new Date(ms) : new Date(String(raw));
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

// Internal endpoint: invoked by /api/webhook/tradingview after it has
// already persisted the signal row. Runs AI + Telegram + analysis insert in
// the background so the public webhook can respond to TradingView in <3s.
export async function POST(req: NextRequest) {
  const expectedSecret = process.env.TRADINGVIEW_WEBHOOK_SECRET;
  if (!expectedSecret) {
    return NextResponse.json(
      { ok: false, error: "Server missing TRADINGVIEW_WEBHOOK_SECRET" },
      { status: 500 }
    );
  }

  let body: { signal_id?: string; payload?: TradingViewPayload; secret?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (body.secret !== expectedSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!body.signal_id || !body.payload) {
    return NextResponse.json({ ok: false, error: "Missing signal_id or payload" }, { status: 400 });
  }

  const signalId = body.signal_id;
  const payload = body.payload;
  const supabase = getSupabaseAdmin();

  // ─── AI active-schedule gate (Phase 2: multi-window + day-of-week) ─────
  // Outside the configured schedule we insert a placeholder ai_signal_analysis
  // row with outcome="QUEUED" — admin can review the queue in the dashboard
  // and later run /api/admin/process-queued to batch-analyze with AI.
  try {
    const cfg = await getScheduleConfig();
    if (!isWithinAiSchedule(cfg.ai_active_windows, cfg.ai_active_days)) {
      const sig = String(payload.signal ?? "").toUpperCase();
      const fallbackBias: "LONG" | "SHORT" | null =
        sig === "BUY" || sig === "LONG"
          ? "LONG"
          : sig === "SELL" || sig === "SHORT"
          ? "SHORT"
          : null;

      const { data: queuedRow, error: queuedErr } = await supabase
        .from("ai_signal_analysis")
        .insert({
          signal_id: signalId,
          symbol: payload.symbol,
          interval: payload.interval,
          bias: fallbackBias,
          confidence: null,
          entry_zone: null,
          entry_low: null,
          entry_high: null,
          stop_loss: null,
          stop_loss_num: null,
          take_profit_1: null,
          take_profit_1_num: null,
          take_profit_2: null,
          take_profit_2_num: null,
          risk_level: null,
          summary_th: "อยู่นอกช่วง AI active hours — รอ admin trigger batch analysis",
          reasoning_th: "[QUEUED] webhook นี้ถูกบันทึกในขณะที่ AI อยู่นอกช่วงเวลาทำงาน admin สามารถสั่งวิเคราะห์ภายหลังได้",
          telegram_sent: false,
          ai_raw_response: null,
          outcome: "QUEUED",
        })
        .select("id")
        .single();

      return NextResponse.json({
        ok: true,
        signal_id: signalId,
        analysis_id: queuedRow?.id ?? null,
        gated: true,
        outcome: "QUEUED",
        reason: "outside_ai_schedule",
        active_windows: cfg.ai_active_windows,
        active_days: cfg.ai_active_days,
        queue_insert_error: queuedErr?.message ?? undefined,
      });
    }
  } catch (err) {
    // Settings unavailable — fail open so signals are still analyzed
    console.error("[webhook/process] ai-schedule check failed, defaulting to ON:", err);
  }

  let aiResult: AIAnalysisResult | undefined;
  let aiRaw: unknown = null;
  let aiContext: unknown = null;
  // Tracked separately so the post-filter and Telegram builder can see the
  // second model's verdict + whether the two agreed.
  let secondaryResult: { model: string; provider: string; result: AIAnalysisResult } | null = null;
  let dualAgreement: { biasAgree: boolean; confidenceDiff: number } | null = null;

  try {
    // Read the freshest model config so admin changes propagate immediately.
    let aiCfg: {
      ai_model?: string;
      ai_mode?: "single" | "compare" | "vote";
      ai_model_secondary?: string;
    } = {};
    try {
      const c = await getScheduleConfig();
      aiCfg = {
        ai_model: c.ai_model,
        ai_mode: c.ai_mode,
        ai_model_secondary: c.ai_model_secondary,
      };
    } catch {
      // Fall through — analyzer uses its own defaults
    }

    const primaryModel = aiCfg.ai_model;
    const mode = aiCfg.ai_mode ?? "single";
    const secondaryModel = aiCfg.ai_model_secondary;

    if ((mode === "compare" || mode === "vote") && secondaryModel && primaryModel) {
      // Dual-model run — both AIs in parallel, share market context.
      const dual = await analyzeDualModel(payload, primaryModel, secondaryModel);
      aiResult = dual.primary.result;
      secondaryResult = dual.secondary
        ? {
            model: dual.secondary.model,
            provider: dual.secondary.provider,
            result: dual.secondary.result,
          }
        : null;
      dualAgreement = dual.agreement;
      aiRaw = {
        ...(dual.primary.raw as Record<string, unknown>),
        market_context: dual.context,
        secondary: dual.secondary,
        secondary_error: dual.secondaryError,
        agreement: dual.agreement,
        ai_mode: mode,
      };
      aiContext = dual.context;
    } else {
      const out = await analyzeCryptoSignal(payload, primaryModel);
      aiResult = out.result;
      aiRaw = {
        ...(out.raw as Record<string, unknown>),
        market_context: out.context,
        ai_mode: "single",
      };
      aiContext = out.context;
    }
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        signal_id: signalId,
        error: `AI analysis failed: ${err instanceof Error ? err.message : "unknown"}`,
      },
      { status: 502 }
    );
  }

  // ── Post-filter: decide the outcome bucket BEFORE inserting so the row is
  //    correctly tagged and downstream backtest/analytics skip it cleanly.
  let outcome: "SKIP_WAIT" | "SKIP_LOW_CONF" | "SKIP_HOUR" | "PENDING";
  let filterReason: string | null = null;

  const bkkHour = bangkokHour(payload);

  // Vote-mode: if dual-model active and models disagree → treat as WAIT.
  const voteRejected =
    secondaryResult !== null &&
    dualAgreement !== null &&
    !dualAgreement.biasAgree &&
    // Only enforce when the request actually used vote mode (recorded in aiRaw.ai_mode)
    (aiRaw as { ai_mode?: string })?.ai_mode === "vote";

  if (aiResult.bias === "WAIT") {
    outcome = "SKIP_WAIT";
  } else if (voteRejected) {
    outcome = "SKIP_WAIT";
    filterReason = `Vote mode: models disagree — primary=${aiResult.bias}/${aiResult.confidence}%, secondary=${secondaryResult!.result.bias}/${secondaryResult!.result.confidence}%`;
  } else if (bkkHour !== null && BLOCKED_HOURS.includes(bkkHour)) {
    outcome = "SKIP_HOUR";
    filterReason = `Blocked hour ${String(bkkHour).padStart(2, "0")}:00 (BKK) — historical win rate < 40%`;
  } else if (aiResult.confidence < MIN_CONFIDENCE) {
    outcome = "SKIP_LOW_CONF";
    filterReason = `AI confidence ${aiResult.confidence}% < threshold ${MIN_CONFIDENCE}%`;
  } else {
    outcome = "PENDING";
  }

  // Mutate reasoning so the dashboard surfaces *why* a signal was filtered.
  const reasoningWithFilter = filterReason
    ? `[FILTERED: ${filterReason}] ${aiResult.reasoning_th}`
    : aiResult.reasoning_th;

  const { data: analysisRow, error: analysisErr } = await supabase
    .from("ai_signal_analysis")
    .insert({
      signal_id: signalId,
      symbol: payload.symbol,
      interval: payload.interval,
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
      reasoning_th: reasoningWithFilter,
      telegram_sent: false,
      ai_raw_response: aiRaw,
      outcome,
    })
    .select("id")
    .single();

  if (analysisErr || !analysisRow) {
    return NextResponse.json(
      {
        ok: false,
        signal_id: signalId,
        error: `Analysis insert failed: ${analysisErr?.message ?? "unknown"}`,
      },
      { status: 500 }
    );
  }

  const analysisId = analysisRow.id as string;

  // Skip Telegram for any non-actionable outcome.
  if (outcome !== "PENDING") {
    return NextResponse.json({
      ok: true,
      signal_id: signalId,
      analysis_id: analysisId,
      telegram_sent: false,
      filtered: true,
      outcome,
      filter_reason: filterReason,
    });
  }

  const message = buildTelegramMessage(payload, aiResult, aiContext, {
    secondary: secondaryResult,
    agreement: dualAgreement,
  });
  const tg = await broadcastTelegramMessage(message);

  if (tg.ok) {
    await supabase
      .from("ai_signal_analysis")
      .update({ telegram_sent: true })
      .eq("id", analysisId);
  }

  return NextResponse.json({
    ok: true,
    signal_id: signalId,
    analysis_id: analysisId,
    telegram_sent: tg.ok,
    telegram_recipients: tg.sent,
    telegram_failed: tg.failed,
    telegram_errors: tg.errors.length > 0 ? tg.errors : undefined,
  });
}
