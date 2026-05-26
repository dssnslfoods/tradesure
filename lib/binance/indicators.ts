// Compute technical indicators for an arbitrary symbol from Binance klines.
// Used by the Telegram on-demand AI analysis feature so the AI prompt has the
// same kind of numeric context (RSI/ATR/EMA/volume) that Pine sends for live
// webhook signals.

export interface OHLCV {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export interface SymbolIndicators {
  symbol: string;
  interval: string;
  price: number;
  rsi: number | null;
  atr: number | null;
  atrPct: number | null;
  emaFast: number | null;   // EMA 9 (or 20 for intraday)
  emaSlow: number | null;   // EMA 21 (or 50)
  emaTrend: number | null;  // EMA 50 (or 100)
  dailyEma200: number | null;
  volume: number | null;
  volumeMa: number | null;
}

/** Map a trading-plan key → the chart timeframe its analysis should use. */
export function planInterval(planKey: string): string {
  switch (planKey) {
    case "intraday": return "15m";
    case "scalp30":  return "30m";
    case "swing":
    default:         return "1h";
  }
}

/** Per-plan EMA lengths so on-demand analysis matches the plan's indicator. */
export function planEmaLengths(planKey: string): { fast: number; slow: number; trend: number } {
  switch (planKey) {
    case "intraday": return { fast: 20, slow: 50, trend: 100 };
    case "scalp30":  return { fast: 9,  slow: 21, trend: 100 };
    case "swing":
    default:         return { fast: 9,  slow: 21, trend: 50 };
  }
}

async function fetchKlines(symbol: string, interval: string, limit: number): Promise<OHLCV[]> {
  const url = new URL("https://api.binance.com/api/v3/klines");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", interval);
  url.searchParams.set("limit", String(limit));
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];
  const raw = (await res.json()) as Array<unknown[]>;
  return raw.map((k) => ({
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
    closeTime: Number(k[6]),
  }));
}

function ema(values: number[], length: number): number | null {
  if (values.length < length) return null;
  const k = 2 / (length + 1);
  // Seed with SMA of first `length` values
  let prev = values.slice(0, length).reduce((a, b) => a + b, 0) / length;
  for (let i = length; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
  }
  return prev;
}

function rsi(closes: number[], length = 14): number | null {
  if (closes.length < length + 1) return null;
  let gains = 0;
  let losses = 0;
  // Initial average over first `length` changes
  for (let i = 1; i <= length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / length;
  let avgLoss = losses / length;
  // Wilder smoothing for the rest
  for (let i = length + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (length - 1) + gain) / length;
    avgLoss = (avgLoss * (length - 1) + loss) / length;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function atr(bars: OHLCV[], length = 14): number | null {
  if (bars.length < length + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const h = bars[i].high;
    const l = bars[i].low;
    const pc = bars[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  // Wilder smoothing
  let prev = trs.slice(0, length).reduce((a, b) => a + b, 0) / length;
  for (let i = length; i < trs.length; i++) {
    prev = (prev * (length - 1) + trs[i]) / length;
  }
  return prev;
}

/**
 * Fetch klines for a symbol on the plan's timeframe and compute the indicator
 * bundle. Also pulls the daily EMA200 for regime context. Returns null if
 * Binance has no data for the symbol (e.g., typo).
 */
export async function computeSymbolIndicators(
  symbol: string,
  planKey: string
): Promise<SymbolIndicators | null> {
  const interval = planInterval(planKey);
  const { fast, slow, trend } = planEmaLengths(planKey);

  const [bars, dailyBars] = await Promise.all([
    fetchKlines(symbol, interval, 250),
    fetchKlines(symbol, "1d", 250),
  ]);

  if (bars.length === 0) return null;

  const closes = bars.map((b) => b.close);
  const price = closes[closes.length - 1];
  const atrVal = atr(bars, 14);
  const volumes = bars.map((b) => b.volume);
  const volMa =
    volumes.length >= 20
      ? volumes.slice(-20).reduce((a, b) => a + b, 0) / 20
      : null;
  const dailyCloses = dailyBars.map((b) => b.close);

  return {
    symbol,
    interval,
    price,
    rsi: rsi(closes, 14),
    atr: atrVal,
    atrPct: atrVal !== null && price > 0 ? (atrVal / price) * 100 : null,
    emaFast: ema(closes, fast),
    emaSlow: ema(closes, slow),
    emaTrend: ema(closes, trend),
    dailyEma200: ema(dailyCloses, 200),
    volume: volumes[volumes.length - 1] ?? null,
    volumeMa: volMa,
  };
}

/** Normalize user input → a Binance USDT-perp/spot symbol. "btc" → "BTCUSDT". */
export function normalizeSymbol(raw: string): string | null {
  const s = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.length < 2 || s.length > 20) return null;
  if (s.endsWith("USDT")) return s;
  if (s.endsWith("USD")) return s + "T";
  return s + "USDT";
}
