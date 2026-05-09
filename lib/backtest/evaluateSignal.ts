import type { AIBias, Outcome } from "@/types/signal";

// Map TradingView interval strings → Binance kline intervals.
// TradingView sends things like "15", "60", "240", "D", "1W"; some users
// configure the alert to send the human form ("15m", "1h", "4h", "1d").
// We accept both.
const INTERVAL_MAP: Record<string, string> = {
  "1": "1m", "1m": "1m",
  "3": "3m", "3m": "3m",
  "5": "5m", "5m": "5m",
  "15": "15m", "15m": "15m",
  "30": "30m", "30m": "30m",
  "60": "1h", "1h": "1h",
  "120": "2h", "2h": "2h",
  "240": "4h", "4h": "4h",
  "360": "6h", "6h": "6h",
  "480": "8h", "8h": "8h",
  "720": "12h", "12h": "12h",
  D: "1d", "1d": "1d", "1D": "1d",
  "1w": "1w", W: "1w", "1W": "1w",
  "1M": "1M",
};

const MAX_BARS = 200; // first 200 bars after signal — typical trade horizon

interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  closeTime: number;
}

export interface SignalForEvaluation {
  id: string;
  symbol: string;
  interval: string;
  bias: AIBias;
  signal_time: string;
  signal_price: number | null;
  entry_low: number | null;
  entry_high: number | null;
  stop_loss_num: number | null;
  take_profit_1_num: number | null;
  take_profit_2_num: number | null;
}

export interface EvaluationResult {
  outcome: Outcome;
  outcome_price: number | null;
  outcome_at: string | null;
  pnl_pct: number | null;
  max_favorable_excursion_pct: number | null;
  max_adverse_excursion_pct: number | null;
  bars_evaluated: number;
  evaluator_note: string | null;
}

function normalizeInterval(tv: string): string | null {
  return INTERVAL_MAP[tv] ?? INTERVAL_MAP[tv.toLowerCase()] ?? null;
}

async function fetchKlines(
  symbol: string,
  interval: string,
  startMs: number
): Promise<Kline[]> {
  const url = new URL("https://api.binance.com/api/v3/klines");
  url.searchParams.set("symbol", symbol.toUpperCase());
  url.searchParams.set("interval", interval);
  url.searchParams.set("startTime", String(startMs));
  url.searchParams.set("limit", String(MAX_BARS));

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Binance ${res.status}: ${txt.slice(0, 200)}`);
  }
  const raw = (await res.json()) as Array<
    [number, string, string, string, string, string, number, ...unknown[]]
  >;
  return raw.map((b) => ({
    openTime: b[0],
    open: Number(b[1]),
    high: Number(b[2]),
    low: Number(b[3]),
    close: Number(b[4]),
    closeTime: b[6],
  }));
}

function pnl(bias: AIBias, entry: number, exit: number): number {
  if (!entry) return 0;
  const raw = bias === "LONG" ? (exit - entry) / entry : (entry - exit) / entry;
  return Math.round(raw * 10000) / 100; // pct, 2 decimals
}

export async function evaluateSignal(
  s: SignalForEvaluation
): Promise<EvaluationResult> {
  const skip = (note: string, outcome: Outcome = "SKIP_WAIT"): EvaluationResult => ({
    outcome,
    outcome_price: null,
    outcome_at: null,
    pnl_pct: null,
    max_favorable_excursion_pct: null,
    max_adverse_excursion_pct: null,
    bars_evaluated: 0,
    evaluator_note: note,
  });

  if (s.bias === "WAIT") return skip("AI recommended WAIT");

  const sl = s.stop_loss_num;
  const tp1 = s.take_profit_1_num;
  const tp2 = s.take_profit_2_num;
  const entry = s.signal_price ?? s.entry_high ?? s.entry_low;

  if (!entry || sl === null || tp1 === null || tp2 === null) {
    return skip("Missing numeric levels (entry/SL/TP)", "NO_DATA");
  }

  const intervalBinance = normalizeInterval(s.interval);
  if (!intervalBinance) return skip(`Unsupported interval: ${s.interval}`, "NO_DATA");

  const startMs = new Date(s.signal_time).getTime();
  if (!Number.isFinite(startMs)) return skip("Bad signal_time", "ERROR");

  let klines: Kline[];
  try {
    klines = await fetchKlines(s.symbol, intervalBinance, startMs);
  } catch (err) {
    return skip(
      err instanceof Error ? err.message : "fetchKlines failed",
      "NO_DATA"
    );
  }

  if (klines.length === 0) {
    return skip("No klines returned (symbol not on Binance?)", "NO_DATA");
  }

  let mfe = 0; // max favorable excursion (%)
  let mae = 0; // max adverse excursion (%)
  let lastBar: Kline | null = null;

  for (let i = 0; i < klines.length; i++) {
    const k = klines[i];
    lastBar = k;

    if (s.bias === "LONG") {
      const favorable = pnl("LONG", entry, k.high);
      const adverse = pnl("LONG", entry, k.low);
      if (favorable > mfe) mfe = favorable;
      if (adverse < mae) mae = adverse;

      // First-touch model. If both SL and TP touched in same bar, assume SL
      // hit first (conservative pessimistic).
      const slHit = k.low <= sl;
      const tp2Hit = k.high >= tp2;
      const tp1Hit = k.high >= tp1;

      if (slHit) {
        return {
          outcome: "LOSS_SL",
          outcome_price: sl,
          outcome_at: new Date(k.closeTime).toISOString(),
          pnl_pct: pnl("LONG", entry, sl),
          max_favorable_excursion_pct: mfe,
          max_adverse_excursion_pct: mae,
          bars_evaluated: i + 1,
          evaluator_note: null,
        };
      }
      if (tp2Hit) {
        return {
          outcome: "WIN_TP2",
          outcome_price: tp2,
          outcome_at: new Date(k.closeTime).toISOString(),
          pnl_pct: pnl("LONG", entry, tp2),
          max_favorable_excursion_pct: mfe,
          max_adverse_excursion_pct: mae,
          bars_evaluated: i + 1,
          evaluator_note: null,
        };
      }
      if (tp1Hit) {
        return {
          outcome: "WIN_TP1",
          outcome_price: tp1,
          outcome_at: new Date(k.closeTime).toISOString(),
          pnl_pct: pnl("LONG", entry, tp1),
          max_favorable_excursion_pct: mfe,
          max_adverse_excursion_pct: mae,
          bars_evaluated: i + 1,
          evaluator_note: null,
        };
      }
    } else {
      // SHORT — flipped
      const favorable = pnl("SHORT", entry, k.low);
      const adverse = pnl("SHORT", entry, k.high);
      if (favorable > mfe) mfe = favorable;
      if (adverse < mae) mae = adverse;

      const slHit = k.high >= sl;
      const tp2Hit = k.low <= tp2;
      const tp1Hit = k.low <= tp1;

      if (slHit) {
        return {
          outcome: "LOSS_SL",
          outcome_price: sl,
          outcome_at: new Date(k.closeTime).toISOString(),
          pnl_pct: pnl("SHORT", entry, sl),
          max_favorable_excursion_pct: mfe,
          max_adverse_excursion_pct: mae,
          bars_evaluated: i + 1,
          evaluator_note: null,
        };
      }
      if (tp2Hit) {
        return {
          outcome: "WIN_TP2",
          outcome_price: tp2,
          outcome_at: new Date(k.closeTime).toISOString(),
          pnl_pct: pnl("SHORT", entry, tp2),
          max_favorable_excursion_pct: mfe,
          max_adverse_excursion_pct: mae,
          bars_evaluated: i + 1,
          evaluator_note: null,
        };
      }
      if (tp1Hit) {
        return {
          outcome: "WIN_TP1",
          outcome_price: tp1,
          outcome_at: new Date(k.closeTime).toISOString(),
          pnl_pct: pnl("SHORT", entry, tp1),
          max_favorable_excursion_pct: mfe,
          max_adverse_excursion_pct: mae,
          bars_evaluated: i + 1,
          evaluator_note: null,
        };
      }
    }
  }

  // Window exhausted, no level hit yet
  return {
    outcome: "OPEN",
    outcome_price: lastBar ? lastBar.close : null,
    outcome_at: lastBar ? new Date(lastBar.closeTime).toISOString() : null,
    pnl_pct: lastBar ? pnl(s.bias, entry, lastBar.close) : null,
    max_favorable_excursion_pct: mfe,
    max_adverse_excursion_pct: mae,
    bars_evaluated: klines.length,
    evaluator_note: `OPEN after ${klines.length} bars`,
  };
}
