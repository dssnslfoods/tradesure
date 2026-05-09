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
