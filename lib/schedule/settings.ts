import { getSupabaseAdmin } from "@/lib/supabase/server";

export interface BacktestScheduleConfig {
  enabled: boolean;
  interval_minutes: number;
  paused_reason: string | null;
  // Auto-archive cards on the dashboard after N days once they reach a terminal
  // outcome (WIN_*, LOSS_SL, SKIP_*, NO_DATA, ERROR). 0 = never archive.
  // Rows stay in the database so analytics keep their full history.
  card_retention_days: number;
  last_run_at: string | null;
  last_result: {
    evaluated: number;
    win: number;
    loss: number;
    open: number;
    skipped: number;
    win_rate_pct: number | null;
    error?: string | null;
  } | null;
}

const DEFAULT_CONFIG: BacktestScheduleConfig = {
  enabled: true,
  interval_minutes: 15,
  paused_reason: null,
  card_retention_days: 7,
  last_run_at: null,
  last_result: null,
};

const KEY = "backtest_schedule";

export async function getScheduleConfig(): Promise<BacktestScheduleConfig> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", KEY)
    .maybeSingle();
  if (error) throw new Error(`getScheduleConfig: ${error.message}`);
  if (!data) {
    await supabase.from("app_settings").insert({ key: KEY, value: DEFAULT_CONFIG });
    return DEFAULT_CONFIG;
  }
  return { ...DEFAULT_CONFIG, ...(data.value as Partial<BacktestScheduleConfig>) };
}

export async function updateScheduleConfig(
  patch: Partial<BacktestScheduleConfig>
): Promise<BacktestScheduleConfig> {
  const supabase = getSupabaseAdmin();
  const current = await getScheduleConfig();
  const next: BacktestScheduleConfig = { ...current, ...patch };
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: KEY, value: next, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(`updateScheduleConfig: ${error.message}`);
  return next;
}

export async function recordBacktestRun(row: {
  triggered_by: "cron" | "manual" | "webhook";
  evaluated: number;
  win: number;
  loss: number;
  open: number;
  skipped: number;
  win_rate_pct: number | null;
  duration_ms: number;
  error?: string | null;
}) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("backtest_runs").insert(row);
  if (error) throw new Error(`recordBacktestRun: ${error.message}`);

  await updateScheduleConfig({
    last_run_at: new Date().toISOString(),
    last_result: {
      evaluated: row.evaluated,
      win: row.win,
      loss: row.loss,
      open: row.open,
      skipped: row.skipped,
      win_rate_pct: row.win_rate_pct,
      error: row.error ?? null,
    },
  });
}

export interface BacktestRunRow {
  id: string;
  triggered_by: string;
  evaluated: number;
  win: number;
  loss: number;
  open: number;
  skipped: number;
  win_rate_pct: number | null;
  duration_ms: number | null;
  error: string | null;
  created_at: string;
}

export async function listRecentRuns(limit = 20): Promise<BacktestRunRow[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("backtest_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listRecentRuns: ${error.message}`);
  return (data ?? []) as BacktestRunRow[];
}
