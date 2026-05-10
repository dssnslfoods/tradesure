"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/server";

interface BacktestRunResult {
  ok: boolean;
  evaluated?: number;
  win?: number;
  loss?: number;
  open?: number;
  win_rate_pct?: number | null;
  error?: string;
  skipped?: boolean;
  reason?: string;
}

export async function runBacktest(mode: "new" | "all"): Promise<BacktestRunResult> {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.URL ??
    "http://localhost:3000";
  const secret = process.env.BACKTEST_CRON_SECRET ?? "";

  const qs = mode === "all" ? "reeval=1&limit=500&force=1&trigger=manual" : "limit=500&force=1&trigger=manual";

  try {
    const res = await fetch(`${base}/api/backtest/run?${qs}`, {
      method: "POST",
      headers: secret ? { "x-cron-secret": secret } : {},
      cache: "no-store",
    });
    const data = (await res.json()) as BacktestRunResult;
    revalidatePath("/dashboard");
    return data;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network error" };
  }
}

export async function deleteSignal(signalId: string): Promise<{ ok: boolean; error?: string }> {
  if (!signalId) return { ok: false, error: "missing signalId" };
  try {
    const supabase = getSupabaseAdmin();
    // ai_signal_analysis cascades via FK on signal_id
    const { error } = await supabase
      .from("tradingview_signals")
      .delete()
      .eq("id", signalId);
    if (error) throw error;
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}

export async function updateSignalLevels(
  analysisId: string,
  levels: {
    stop_loss_num: number | null;
    take_profit_1_num: number | null;
    take_profit_2_num: number | null;
    entry_low?: number | null;
    entry_high?: number | null;
  }
): Promise<{ ok: boolean; error?: string }> {
  if (!analysisId) return { ok: false, error: "missing analysisId" };

  // Sanity-check the numbers (must be positive finite, TP/SL on correct sides
  // would require knowing bias — skip that check here; backtest will simply
  // re-evaluate based on whatever's stored).
  const sanitize = (v: number | null | undefined): number | null => {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  };

  const update = {
    stop_loss_num: sanitize(levels.stop_loss_num),
    take_profit_1_num: sanitize(levels.take_profit_1_num),
    take_profit_2_num: sanitize(levels.take_profit_2_num),
    entry_low: sanitize(levels.entry_low ?? null),
    entry_high: sanitize(levels.entry_high ?? null),
    // Also rebuild the human-readable text fields so they stay in sync.
    stop_loss: sanitize(levels.stop_loss_num) !== null ? String(sanitize(levels.stop_loss_num)) : null,
    take_profit_1: sanitize(levels.take_profit_1_num) !== null ? String(sanitize(levels.take_profit_1_num)) : null,
    take_profit_2: sanitize(levels.take_profit_2_num) !== null ? String(sanitize(levels.take_profit_2_num)) : null,
    // Reset backtest state so the next run re-evaluates with new levels.
    outcome: "PENDING",
    outcome_price: null,
    outcome_at: null,
    pnl_pct: null,
    bars_evaluated: null,
    evaluator_note: "Re-evaluation pending: levels manually edited",
    evaluated_at: null,
  };

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("ai_signal_analysis")
      .update(update)
      .eq("id", analysisId);
    if (error) throw error;
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}

export async function deleteSignals(signalIds: string[]): Promise<{ ok: boolean; deleted?: number; error?: string }> {
  const ids = (signalIds ?? []).filter((s) => typeof s === "string" && s.length > 0);
  if (ids.length === 0) return { ok: false, error: "no ids provided" };
  try {
    const supabase = getSupabaseAdmin();
    const { error, count } = await supabase
      .from("tradingview_signals")
      .delete({ count: "exact" })
      .in("id", ids);
    if (error) throw error;
    revalidatePath("/dashboard");
    return { ok: true, deleted: count ?? ids.length };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}
