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
  isPlanTelegramEnabled,
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

  // ── Always-direction filter logic (Phase 2 post-2026-05-16):
  //    Every signal stored with bias=LONG/SHORT + outcome=PENDING so backtest
  //    evaluates it. Filter rules now control `recommended` instead of
  //    diverting to SKIP_* outcomes — keeps stats by-confidence-bucket
  //    meaningful. recommendation_reason captures *why* not recommended.

  const bkkHour = bangkokHour(payload);

  // Vote-mode: if dual-model active and models disagree → not recommended.
  const voteRejected =
    secondaryResult !== null &&
    dualAgreement !== null &&
    !dualAgreement.biasAgree &&
    (aiRaw as { ai_mode?: string })?.ai_mode === "vote";

  // Compose recommended: start from AI's own recommendation, then apply
  // each filter as a possible downgrade. First failing rule wins (its
  // reason is recorded in recommendation_reason).
  let recommended = aiResult.recommended;
  let recReason: string | null = aiResult.recommendation_reason ?? null;

  // Pine-side NO_TRADE always forces recommended=false — Pine indicator
  // determined there's no clean setup. AI's direction guess is still
  // recorded for stats tracking, but we never recommend taking it.
  const pineSignal = String(payload.signal ?? "").toUpperCase();
  if (pineSignal === "NO_TRADE") {
    recommended = false;
    recReason = recReason ?? "Pine indicator flagged NO_TRADE (no setup ตามเงื่อนไข indicator)";
  } else if (voteRejected) {
    recommended = false;
    recReason = `Vote disagree — primary=${aiResult.bias}/${aiResult.confidence}%, secondary=${secondaryResult!.result.bias}/${secondaryResult!.result.confidence}%`;
  } else if (bkkHour !== null && BLOCKED_HOURS.includes(bkkHour)) {
    recommended = false;
    recReason = `Blocked hour ${String(bkkHour).padStart(2, "0")}:00 (BKK) — historical win rate < 40%`;
  } else if (aiResult.confidence < MIN_CONFIDENCE) {
    recommended = false;
    recReason = recReason ?? `AI confidence ${aiResult.confidence}% < threshold ${MIN_CONFIDENCE}%`;
  }

  // Outcome bucket — always PENDING so the backtest evaluator picks it up.
  // Legacy SKIP_* outcomes are no longer emitted by this code path; they
  // remain in DB on old rows and the dashboard still groups them as "skip".
  const outcome: "PENDING" = "PENDING";
  const filterReason = recommended ? null : recReason;

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
      recommended,
      recommendation_reason: recReason,
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

  // Phase 2: send Telegram for ALL signals so user sees the trade plan
  // even on low-conviction setups. Stats are still tracked via the
  // `recommended` column for "win rate by confidence" views.
  //
  // Two gates can suppress Telegram broadcast (both default to allowing it):
  //   1. Per-plan Telegram switch (catalog field `telegram_enabled`) —
  //      lets admin silently monitor a new plan before promoting.
  //   2. Env NOTIFY_NOT_RECOMMENDED=0 — suppresses all not-recommended
  //      messages (good for cutting noise once stats stabilize).
  const planTelegramOn = await isPlanTelegramEnabled(
    String(payload.signal_type ?? "swing")
  );
  const notifyNotRec = (process.env.NOTIFY_NOT_RECOMMENDED ?? "1") !== "0";
  const tgSuppressed = !planTelegramOn || (!recommended && !notifyNotRec);
  if (tgSuppressed) {
    return NextResponse.json({
      ok: true,
      signal_id: signalId,
      analysis_id: analysisId,
      telegram_sent: false,
      telegram_suppressed_reason: !planTelegramOn
        ? "plan_telegram_disabled"
        : "not_recommended_and_notify_off",
      filtered: !recommended,
      outcome,
      recommended,
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
