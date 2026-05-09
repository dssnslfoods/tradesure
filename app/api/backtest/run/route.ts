import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  evaluateSignal,
  SignalForEvaluation,
} from "@/lib/backtest/evaluateSignal";
import {
  getScheduleConfig,
  recordBacktestRun,
} from "@/lib/schedule/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AnalysisJoinRow {
  id: string;
  symbol: string;
  interval: string;
  bias: "LONG" | "SHORT" | "WAIT" | null;
  entry_low: number | null;
  entry_high: number | null;
  stop_loss_num: number | null;
  take_profit_1_num: number | null;
  take_profit_2_num: number | null;
  tradingview_signals: {
    raw_payload: { time?: string } | null;
    price: number | null;
    created_at: string;
  } | null;
}

function authorize(req: NextRequest): boolean {
  const expected = process.env.BACKTEST_CRON_SECRET;
  if (!expected) return true; // dev: allow if not set
  const got =
    req.headers.get("x-cron-secret") ??
    req.nextUrl.searchParams.get("secret") ??
    "";
  return got === expected;
}

export async function GET(req: NextRequest) {
  return runBacktest(req);
}
export async function POST(req: NextRequest) {
  return runBacktest(req);
}

async function runBacktest(req: NextRequest) {
  const startedAt = Date.now();
  if (!authorize(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? 50);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 500) : 50;
  const reEval = req.nextUrl.searchParams.get("reeval") === "1";
  const force = req.nextUrl.searchParams.get("force") === "1";
  const triggerParam = req.nextUrl.searchParams.get("trigger");
  const triggeredBy: "cron" | "manual" | "webhook" =
    triggerParam === "manual" ? "manual"
    : triggerParam === "webhook" ? "webhook"
    : "cron";

  // Honour pause flag — except when force=1 (manual button can override)
  const cfg = await getScheduleConfig();
  if (!cfg.enabled && !force) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "schedule_paused",
      paused_reason: cfg.paused_reason,
    });
  }

  const supabase = getSupabaseAdmin();

  const filterStatuses = reEval
    ? ["PENDING", "OPEN", "NO_DATA", "ERROR", "WIN_TP1", "WIN_TP2", "LOSS_SL"]
    : ["PENDING", "OPEN"];

  const { data, error } = await supabase
    .from("ai_signal_analysis")
    .select(
      `id, symbol, interval, bias,
       entry_low, entry_high, stop_loss_num, take_profit_1_num, take_profit_2_num,
       tradingview_signals:signal_id ( raw_payload, price, created_at )`
    )
    .in("outcome", filterStatuses)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    await safeLog({
      triggered_by: triggeredBy, evaluated: 0, win: 0, loss: 0, open: 0, skipped: 0,
      win_rate_pct: null, duration_ms: Date.now() - startedAt, error: error.message,
    });
    return NextResponse.json(
      { ok: false, error: `Supabase query failed: ${error.message}` },
      { status: 500 }
    );
  }

  const rows = (data ?? []) as unknown as AnalysisJoinRow[];

  let win = 0;
  let loss = 0;
  let open = 0;
  let skipped = 0;
  const results: Array<{ id: string; outcome: string; pnl_pct: number | null }> = [];

  for (const row of rows) {
    const signalTime =
      row.tradingview_signals?.raw_payload?.time ??
      row.tradingview_signals?.created_at ??
      null;

    if (!signalTime || !row.bias) {
      skipped++;
      continue;
    }

    const input: SignalForEvaluation = {
      id: row.id,
      symbol: row.symbol,
      interval: row.interval,
      bias: row.bias,
      signal_time: signalTime,
      signal_price: row.tradingview_signals?.price ?? null,
      entry_low: row.entry_low,
      entry_high: row.entry_high,
      stop_loss_num: row.stop_loss_num,
      take_profit_1_num: row.take_profit_1_num,
      take_profit_2_num: row.take_profit_2_num,
    };

    const evalResult = await evaluateSignal(input);

    await supabase
      .from("ai_signal_analysis")
      .update({
        outcome: evalResult.outcome,
        outcome_price: evalResult.outcome_price,
        outcome_at: evalResult.outcome_at,
        pnl_pct: evalResult.pnl_pct,
        max_favorable_excursion_pct: evalResult.max_favorable_excursion_pct,
        max_adverse_excursion_pct: evalResult.max_adverse_excursion_pct,
        bars_evaluated: evalResult.bars_evaluated,
        evaluated_at: new Date().toISOString(),
        evaluator_note: evalResult.evaluator_note,
      })
      .eq("id", row.id);

    if (evalResult.outcome === "WIN_TP1" || evalResult.outcome === "WIN_TP2") win++;
    else if (evalResult.outcome === "LOSS_SL") loss++;
    else if (evalResult.outcome === "OPEN") open++;
    else skipped++;

    results.push({ id: row.id, outcome: evalResult.outcome, pnl_pct: evalResult.pnl_pct });
  }

  const decided = win + loss;
  const winRate = decided > 0 ? Math.round((win / decided) * 1000) / 10 : null;

  await safeLog({
    triggered_by: triggeredBy,
    evaluated: rows.length, win, loss, open, skipped,
    win_rate_pct: winRate,
    duration_ms: Date.now() - startedAt,
    error: null,
  });

  return NextResponse.json({
    ok: true,
    evaluated: rows.length,
    win,
    loss,
    open,
    skipped,
    win_rate_pct: winRate,
    results,
  });
}

async function safeLog(row: Parameters<typeof recordBacktestRun>[0]) {
  try {
    await recordBacktestRun(row);
  } catch (e) {
    console.error("recordBacktestRun failed", e);
  }
}
