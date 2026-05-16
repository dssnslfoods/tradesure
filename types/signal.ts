// TradingPlan keys are now dynamic (master data in app_settings) — admin
// can add new plans (e.g. "scalp30" for 30m TF) without code changes.
// Pre-Phase-2 the type was a string literal union of "swing"|"intraday";
// it's relaxed to string so any catalog-defined key flows end-to-end.
export type TradingPlan = string;

// Default catalog keys — used as legacy fallback. The actual catalog lives
// in app_settings.value under key "trading_plans_catalog" and is mutable.
export const DEFAULT_TRADING_PLAN_KEYS: readonly string[] = ["swing", "intraday"];

// A plan definition — stored in the catalog and used to render chips,
// badges, and Telegram tags. Color names map to tailwind tokens
// (sig-info, sig-violet, sig-warn, sig-buy, sig-sell, brand).
export interface TradingPlanDef {
  key: string;            // machine name, used in payload signal_type. URL-safe.
  label: string;          // display name, e.g., "Scalp · 30m"
  emoji: string;          // single emoji, e.g., "🟢"
  color: "info" | "violet" | "warn" | "buy" | "sell" | "brand"; // chip color
  description?: string;   // optional admin note
}

export interface TradingViewPayload {
  secret?: string;
  symbol: string;
  exchange?: string;
  interval: string;
  price: string | number;
  time: string;
  signal: string;
  strategy?: string;
  // Plan tag — Pine v2.1 (1H) sends "swing", Pine v3 (15m) sends "intraday".
  // Missing/legacy alerts default to "swing" at the webhook boundary.
  signal_type?: TradingPlan;
  rsi?: string | number;
  ema_fast?: string | number;
  ema_slow?: string | number;
  note?: string;
  [key: string]: unknown;
}

// Post-Phase-2 (2026-05-16): AI now always returns LONG or SHORT — never
// WAIT. WAIT is kept in the union only so legacy rows still type-check.
export type AIBias = "LONG" | "SHORT" | "WAIT";
export type RiskLevel = "Low" | "Medium" | "High";

export interface AIAnalysisResult {
  bias: AIBias;
  confidence: number;
  // Whether AI recommends taking this trade. Independent of bias direction —
  // a non-recommended signal still has full entry/SL/TP so the system can
  // backtest and aggregate stats by confidence bucket. The pipeline overrides
  // this to false when filter rules (blocked hour, vote disagree, threshold)
  // would have rejected the trade.
  recommended: boolean;
  // Optional reason when recommended=false (AI's reasoning OR a filter reason)
  recommendation_reason?: string | null;
  entry_zone: string;
  entry_low: number | null;
  entry_high: number | null;
  stop_loss: string;
  stop_loss_num: number | null;
  take_profit_1: string;
  take_profit_1_num: number | null;
  take_profit_2: string;
  take_profit_2_num: number | null;
  risk_level: RiskLevel;
  summary_th: string;
  reasoning_th: string;
}

export type Outcome =
  | "PENDING"
  | "QUEUED"        // gated by AI active hours/days — awaiting batch processing by admin
  | "SKIP_WAIT"
  | "SKIP_LOW_CONF" // AI confidence below threshold — not sent to Telegram, not backtested
  | "SKIP_HOUR"     // signal arrived during a blocked low win-rate hour
  | "WIN_TP1"
  | "WIN_TP2"
  | "LOSS_SL"
  | "OPEN"
  | "NO_DATA"
  | "ERROR";

export interface SignalRow {
  id: string;
  symbol: string;
  exchange: string | null;
  interval: string;
  price: number | null;
  signal: string;
  strategy: string | null;
  signal_type: TradingPlan | null;
  raw_payload: TradingViewPayload;
  created_at: string;
}

export interface AnalysisRow {
  id: string;
  signal_id: string;
  symbol: string;
  interval: string;
  bias: AIBias | null;
  confidence: number | null;
  entry_zone: string | null;
  stop_loss: string | null;
  take_profit_1: string | null;
  take_profit_2: string | null;
  risk_level: RiskLevel | null;
  summary_th: string | null;
  reasoning_th: string | null;
  telegram_sent: boolean;
  ai_raw_response: unknown;
  created_at: string;
}

export interface DashboardRow extends AnalysisRow {
  signal_price: number | null;
  signal_value: string;
}
