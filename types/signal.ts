export interface TradingViewPayload {
  secret?: string;
  symbol: string;
  exchange?: string;
  interval: string;
  price: string | number;
  time: string;
  signal: string;
  strategy?: string;
  rsi?: string | number;
  ema_fast?: string | number;
  ema_slow?: string | number;
  note?: string;
  [key: string]: unknown;
}

export type AIBias = "LONG" | "SHORT" | "WAIT";
export type RiskLevel = "Low" | "Medium" | "High";

export interface AIAnalysisResult {
  bias: AIBias;
  confidence: number;
  entry_zone: string;
  stop_loss: string;
  take_profit_1: string;
  take_profit_2: string;
  risk_level: RiskLevel;
  summary_th: string;
  reasoning_th: string;
}

export interface SignalRow {
  id: string;
  symbol: string;
  exchange: string | null;
  interval: string;
  price: number | null;
  signal: string;
  strategy: string | null;
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
