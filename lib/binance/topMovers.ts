// Binance public 24h ticker — no API key needed.
// Filters to USDT spot pairs and sorts by various trending criteria.

import { tagFor, type CoinTag } from "@/lib/curated/coinTags";

export type FilterMode = "all" | "blue_chip" | "no_meme";

export interface BinanceTicker {
  symbol: string;
  base: string;          // e.g. "BTC" from "BTCUSDT"
  lastPrice: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
  volume: number;        // base asset volume
  quoteVolume: number;   // USDT volume
  count: number;         // number of trades
  openPrice: number;
  tag: CoinTag;
}

interface RawTicker {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  weightedAvgPrice: string;
  prevClosePrice: string;
  lastPrice: string;
  lastQty: string;
  bidPrice: string;
  bidQty: string;
  askPrice: string;
  askQty: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  openTime: number;
  closeTime: number;
  firstId: number;
  lastId: number;
  count: number;
}

const STABLECOIN_BASES = new Set([
  "USDC", "BUSD", "DAI", "TUSD", "USDP", "FDUSD", "USDD", "PAX", "GUSD", "EUR", "TRY", "BRL", "RUB",
]);

const BLOCKLIST_SUFFIX = ["UP", "DOWN", "BULL", "BEAR"]; // leveraged tokens

function isUsdtPair(symbol: string): boolean {
  return symbol.endsWith("USDT");
}

function baseSymbol(symbol: string): string {
  return symbol.replace(/USDT$/, "");
}

function isLeveragedToken(base: string): boolean {
  return BLOCKLIST_SUFFIX.some((s) => base.endsWith(s));
}

export async function fetchAllUsdtTickers(): Promise<BinanceTicker[]> {
  const res = await fetch("https://api.binance.com/api/v3/ticker/24hr", {
    next: { revalidate: 30 }, // cache for 30s
  });
  if (!res.ok) throw new Error(`Binance HTTP ${res.status}`);
  const raw = (await res.json()) as RawTicker[];

  const tickers: BinanceTicker[] = [];
  for (const t of raw) {
    if (!isUsdtPair(t.symbol)) continue;
    const base = baseSymbol(t.symbol);
    if (STABLECOIN_BASES.has(base)) continue;
    if (isLeveragedToken(base)) continue;
    const lastPrice = Number(t.lastPrice);
    const quoteVolume = Number(t.quoteVolume);
    const pct = Number(t.priceChangePercent);
    if (!Number.isFinite(lastPrice) || lastPrice <= 0) continue;
    if (!Number.isFinite(quoteVolume) || quoteVolume <= 0) continue;
    if (!Number.isFinite(pct)) continue;
    tickers.push({
      symbol: t.symbol,
      base,
      lastPrice,
      priceChangePercent: pct,
      highPrice: Number(t.highPrice),
      lowPrice: Number(t.lowPrice),
      volume: Number(t.volume),
      quoteVolume,
      count: t.count,
      openPrice: Number(t.openPrice),
      tag: tagFor(base),
    });
  }
  return tickers;
}

// Fetch 24x 1h klines for a symbol — used to draw sparklines.
export async function fetchSparkline(
  symbol: string,
  hours = 24
): Promise<number[]> {
  const url = new URL("https://api.binance.com/api/v3/klines");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", "1h");
  url.searchParams.set("limit", String(hours));
  const res = await fetch(url, { next: { revalidate: 60 } });
  if (!res.ok) return [];
  const raw = (await res.json()) as Array<unknown[]>;
  return raw.map((k) => Number(k[4])).filter((n) => Number.isFinite(n));
}

export async function fetchSparklines(
  symbols: string[]
): Promise<Record<string, number[]>> {
  const results = await Promise.all(
    symbols.map(async (s) => [s, await fetchSparkline(s)] as const)
  );
  return Object.fromEntries(results);
}

export interface TrendingBuckets {
  gainers: BinanceTicker[];
  losers: BinanceTicker[];
  byVolume: BinanceTicker[];
  hottest: BinanceTicker[]; // gainers AND high volume
  fetchedAt: string;
}

export async function getTrendingBuckets(
  topN = 5,
  minVolumeUsdt = 5_000_000, // ignore microcap noise
  filter: FilterMode = "all"
): Promise<TrendingBuckets> {
  const tickers = await fetchAllUsdtTickers();
  let liquid = tickers.filter((t) => t.quoteVolume >= minVolumeUsdt);
  if (filter === "blue_chip") {
    liquid = liquid.filter((t) => t.tag === "blue_chip");
  } else if (filter === "no_meme") {
    liquid = liquid.filter((t) => t.tag !== "memecoin");
  }

  const gainers = [...liquid]
    .sort((a, b) => b.priceChangePercent - a.priceChangePercent)
    .slice(0, topN);

  const losers = [...liquid]
    .sort((a, b) => a.priceChangePercent - b.priceChangePercent)
    .slice(0, topN);

  const byVolume = [...liquid]
    .sort((a, b) => b.quoteVolume - a.quoteVolume)
    .slice(0, topN);

  // "Hottest": rank by combined score of % change × log(volume).
  // Filter to gainers only so we don't reward dumps.
  const hottest = liquid
    .filter((t) => t.priceChangePercent > 0)
    .map((t) => ({
      ticker: t,
      score: t.priceChangePercent * Math.log10(t.quoteVolume),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map((x) => x.ticker);

  return {
    gainers,
    losers,
    byVolume,
    hottest,
    fetchedAt: new Date().toISOString(),
  };
}
