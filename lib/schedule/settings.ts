import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * A single AI active-hours window. Both bounds are integer hours 0..23 in
 * Asia/Bangkok time. start === end means "24h" (the whole day). start > end
 * wraps midnight (e.g., 22 → 6 covers 22:00-06:00 the next day).
 */
export interface AiWindow {
  start: number;
  end: number;
}

export interface BacktestScheduleConfig {
  enabled: boolean;
  interval_minutes: number;
  paused_reason: string | null;
  // Auto-archive cards on the dashboard after N days once they reach a terminal
  // outcome (WIN_*, LOSS_SL, SKIP_*, NO_DATA, ERROR). 0 = never archive.
  // Rows stay in the database so analytics keep their full history.
  card_retention_days: number;

  // AI model selection — picked from lib/ai/models.ts catalog. Falls back to
  // DEFAULT_AI_MODEL when empty. Provider is inferred from the model id.
  ai_model: string;
  // Dual-model "second opinion" mode. When enabled, every signal runs through
  // both `ai_model` (primary) and `ai_model_secondary` in parallel.
  //   - "single" : only primary (default, cheapest)
  //   - "compare": both run, both shown in Telegram + persisted, no gating
  //   - "vote"   : both must agree on bias (and pass confidence threshold) to
  //                send Telegram; disagreements fall through to SKIP_WAIT
  ai_mode: "single" | "compare" | "vote";
  ai_model_secondary: string;

  // ── AI active schedule (Phase 2: multi-window + day-of-week) ──────────
  // Outside this schedule, BUY/SELL webhooks are accepted but no AI analysis
  // runs. A row is still inserted into ai_signal_analysis with outcome="QUEUED"
  // so admin can later batch-process them via /api/admin/process-queued.
  //
  // - ai_active_windows: list of {start, end} ranges. Empty list OR a single
  //   window with start===end (e.g., 0/0) means "always on, 24h".
  // - ai_active_days: list of weekdays where AI runs. 0=Sun, 6=Sat. Empty
  //   list means "no days" (always gated). Defaults to all 7 days.
  ai_active_windows: AiWindow[];
  ai_active_days: number[];

  // ── Legacy single-window fields (kept for backwards compat) ────────────
  // Newer code reads ai_active_windows; these survive only so old JSON in
  // app_settings keeps loading. Setters always write the new fields and clear
  // these to 0/0.
  ai_active_hours_start: number;
  ai_active_hours_end: number;

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

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

const DEFAULT_CONFIG: BacktestScheduleConfig = {
  enabled: true,
  interval_minutes: 15,
  paused_reason: null,
  card_retention_days: 7,
  ai_model: "gpt-4o-mini",   // catalog default — keep in sync with DEFAULT_AI_MODEL
  ai_mode: "single",
  ai_model_secondary: "gemini-2.5-flash", // sensible default if admin flips to compare/vote
  ai_active_windows: [],     // empty == always on
  ai_active_days: ALL_DAYS,  // all 7 days
  ai_active_hours_start: 0,
  ai_active_hours_end: 0,
  last_run_at: null,
  last_result: null,
};

/** Hour 0..23 in Asia/Bangkok for the given Date. */
function bangkokHour(at: Date): number | null {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const h = Number(parts.find((p) => p.type === "hour")?.value);
  return Number.isFinite(h) ? h : null;
}

/** Weekday 0..6 (Sun..Sat) in Asia/Bangkok for the given Date. */
function bangkokWeekday(at: Date): number | null {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    weekday: "short",
  }).formatToParts(at);
  const w = parts.find((p) => p.type === "weekday")?.value;
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return w !== undefined && w in map ? map[w] : null;
}

function isHourInWindow(h: number, w: AiWindow): boolean {
  if (w.start === w.end) return true; // 24h sentinel
  if (w.start < w.end) return h >= w.start && h < w.end;
  return h >= w.start || h < w.end; // wraps midnight
}

/**
 * Returns true if the given Date (or now) is within ALL active-AI gates:
 *   - weekday in ai_active_days
 *   - hour matches at least one window in ai_active_windows
 *     (empty list is treated as "always on")
 */
export function isWithinAiSchedule(
  windows: AiWindow[],
  days: number[],
  at: Date = new Date()
): boolean {
  const h = bangkokHour(at);
  const d = bangkokWeekday(at);
  // Fail open on parse errors — we'd rather analyze a stray signal than block valid ones.
  if (h === null || d === null) return true;

  // Day gate
  if (days.length > 0 && !days.includes(d)) return false;

  // Hour gate: empty list = always on
  if (windows.length === 0) return true;
  return windows.some((w) => isHourInWindow(h, w));
}

/**
 * Backwards-compatible helper. Reads old single-window fields if windows
 * is empty AND old start/end are non-zero — useful while we migrate.
 */
export function isWithinAiHours(
  start: number,
  end: number,
  at: Date = new Date()
): boolean {
  const h = bangkokHour(at);
  if (h === null) return true;
  return isHourInWindow(h, { start, end });
}

/** Migrate legacy single-window config into the new array shape on read. */
function normalizeConfig(cfg: BacktestScheduleConfig): BacktestScheduleConfig {
  const out = { ...cfg };
  if (!Array.isArray(out.ai_active_windows)) out.ai_active_windows = [];
  if (!Array.isArray(out.ai_active_days)) out.ai_active_days = ALL_DAYS;

  // If the new array is empty but the old single fields define a window, migrate.
  if (
    out.ai_active_windows.length === 0 &&
    !(out.ai_active_hours_start === 0 && out.ai_active_hours_end === 0)
  ) {
    out.ai_active_windows = [
      { start: out.ai_active_hours_start, end: out.ai_active_hours_end },
    ];
  }
  return out;
}

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
  return normalizeConfig({
    ...DEFAULT_CONFIG,
    ...(data.value as Partial<BacktestScheduleConfig>),
  });
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

// ─── AI provider API keys ───────────────────────────────────────────────
//
// Stored in app_settings under key="api_keys" so admin can manage them at
// runtime without redeploying. Full keys NEVER leave the server — UI gets a
// masked view via getMaskedApiKeys(). Falls back to OPENAI_API_KEY /
// GEMINI_API_KEY env vars when no DB key is set.

const API_KEYS_SETTING_KEY = "api_keys";

export type AiKeyProvider = "openai" | "gemini";

export interface ApiKeys {
  openai: string | null;
  gemini: string | null;
}

export interface MaskedApiKey {
  configured: boolean;
  source: "db" | "env" | "none";
  mask: string | null; // e.g., "sk-A…b1F2" — never the full key
}

export interface MaskedApiKeys {
  openai: MaskedApiKey;
  gemini: MaskedApiKey;
}

function maskKey(k: string | null | undefined): string | null {
  if (!k) return null;
  if (k.length <= 8) return "•".repeat(k.length);
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}

/**
 * SERVER ONLY. Returns plaintext keys for use in API calls. Prefer the DB
 * setting; fall back to env vars so existing deployments keep working.
 */
export async function getApiKeys(): Promise<ApiKeys> {
  const out: ApiKeys = { openai: null, gemini: null };
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", API_KEYS_SETTING_KEY)
      .maybeSingle();
    const val = (data?.value ?? {}) as Partial<ApiKeys>;
    if (typeof val.openai === "string" && val.openai.length > 0) out.openai = val.openai;
    if (typeof val.gemini === "string" && val.gemini.length > 0) out.gemini = val.gemini;
  } catch {
    // fall through to env
  }
  if (!out.openai && process.env.OPENAI_API_KEY) out.openai = process.env.OPENAI_API_KEY;
  if (!out.gemini && process.env.GEMINI_API_KEY) out.gemini = process.env.GEMINI_API_KEY;
  return out;
}

/** UI-safe view. Returns whether keys are set and a partial mask only. */
export async function getMaskedApiKeys(): Promise<MaskedApiKeys> {
  // Read DB and env separately so we can tell which source the key came from.
  let dbOpenai: string | null = null;
  let dbGemini: string | null = null;
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", API_KEYS_SETTING_KEY)
      .maybeSingle();
    const val = (data?.value ?? {}) as Partial<ApiKeys>;
    if (typeof val.openai === "string" && val.openai.length > 0) dbOpenai = val.openai;
    if (typeof val.gemini === "string" && val.gemini.length > 0) dbGemini = val.gemini;
  } catch {
    // ignore
  }
  const envOpenai = process.env.OPENAI_API_KEY ?? null;
  const envGemini = process.env.GEMINI_API_KEY ?? null;
  const buildView = (db: string | null, env: string | null): MaskedApiKey => {
    if (db) return { configured: true, source: "db", mask: maskKey(db) };
    if (env) return { configured: true, source: "env", mask: maskKey(env) };
    return { configured: false, source: "none", mask: null };
  };
  return {
    openai: buildView(dbOpenai, envOpenai),
    gemini: buildView(dbGemini, envGemini),
  };
}

/**
 * SERVER ONLY. Set or clear a provider's API key. Pass null/empty string to
 * delete (which means env fallback takes over again).
 */
export async function setApiKey(
  provider: AiKeyProvider,
  key: string | null
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", API_KEYS_SETTING_KEY)
    .maybeSingle();
  const current = (data?.value ?? {}) as Partial<ApiKeys>;
  const next: ApiKeys = {
    openai: current.openai ?? null,
    gemini: current.gemini ?? null,
  };
  const trimmed = typeof key === "string" ? key.trim() : "";
  next[provider] = trimmed.length > 0 ? trimmed : null;

  const { error } = await supabase
    .from("app_settings")
    .upsert(
      { key: API_KEYS_SETTING_KEY, value: next, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
  if (error) throw new Error(`setApiKey: ${error.message}`);
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
