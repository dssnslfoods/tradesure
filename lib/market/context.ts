/**
 * Free public-API market context used to enrich the AI prompt.
 *
 * Sources (all free, no API key required):
 *   - Fear & Greed Index → alternative.me   (cache 1h, updates daily)
 *   - BTC Dominance      → CoinGecko        (cache 10m, slow-moving)
 *   - Funding Rate       → Binance Futures  (cache 5m, updates every 8h)
 *
 * We use Promise.allSettled so a single API failure doesn't break the whole
 * pipeline — the AI just sees `null` for the missing metric.
 */

export interface FearGreed {
  value: number;             // 0..100
  classification: string;    // "Extreme Fear" | "Fear" | "Neutral" | "Greed" | "Extreme Greed"
}

export interface BtcDominance {
  value: number;             // percentage
}

export interface FundingRate {
  rate: number;              // e.g., 0.0001 = +0.01% (per 8h)
  symbol: string;
}

export interface MarketContext {
  fearGreed: FearGreed | null;
  btcDominance: BtcDominance | null;
  funding: FundingRate | null;
  fetchedAt: string;
  cached: boolean;
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

// Module-level in-memory caches. Different TTL per source because each one
// changes at a different cadence — refreshing more often is wasted requests.
const fngCache = new Map<string, CacheEntry<FearGreed>>();
const domCache = new Map<string, CacheEntry<BtcDominance>>();
const fundingCache = new Map<string, CacheEntry<FundingRate>>();

const FNG_TTL = 60 * 60 * 1000;       // 1h
const DOM_TTL = 10 * 60 * 1000;       // 10m
const FUNDING_TTL = 5 * 60 * 1000;    // 5m

async function fetchJson<T>(url: string, timeoutMs = 5_000): Promise<T> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return (await res.json()) as T;
}

async function fetchFearGreed(): Promise<FearGreed> {
  const cached = fngCache.get("_");
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const data = await fetchJson<{
    data?: Array<{ value: string; value_classification: string }>;
  }>("https://api.alternative.me/fng/?limit=1");
  const first = data.data?.[0];
  if (!first) throw new Error("fng: empty response");
  const out: FearGreed = {
    value: Number(first.value),
    classification: String(first.value_classification),
  };
  fngCache.set("_", { data: out, expiresAt: Date.now() + FNG_TTL });
  return out;
}

async function fetchBtcDominance(): Promise<BtcDominance> {
  const cached = domCache.get("_");
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const data = await fetchJson<{
    data?: { market_cap_percentage?: { btc?: number } };
  }>("https://api.coingecko.com/api/v3/global");
  const btc = data.data?.market_cap_percentage?.btc;
  if (typeof btc !== "number") throw new Error("dom: missing btc dominance");
  const out: BtcDominance = { value: Math.round(btc * 100) / 100 };
  domCache.set("_", { data: out, expiresAt: Date.now() + DOM_TTL });
  return out;
}

async function fetchFundingRate(symbol: string): Promise<FundingRate> {
  const cached = fundingCache.get(symbol);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  // premiumIndex returns lastFundingRate which is the most recent settled rate.
  const data = await fetchJson<{ lastFundingRate?: string }>(
    `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${encodeURIComponent(symbol)}`
  );
  const rate = Number(data.lastFundingRate);
  if (!Number.isFinite(rate)) throw new Error("funding: invalid rate");
  const out: FundingRate = { rate, symbol };
  fundingCache.set(symbol, { data: out, expiresAt: Date.now() + FUNDING_TTL });
  return out;
}

export async function getMarketContext(symbol = "BTCUSDT"): Promise<MarketContext> {
  const start = Date.now();
  const [fng, dom, funding] = await Promise.allSettled([
    fetchFearGreed(),
    fetchBtcDominance(),
    fetchFundingRate(symbol),
  ]);

  return {
    fearGreed: fng.status === "fulfilled" ? fng.value : null,
    btcDominance: dom.status === "fulfilled" ? dom.value : null,
    funding: funding.status === "fulfilled" ? funding.value : null,
    fetchedAt: new Date(start).toISOString(),
    cached: false, // simplification — if all three were cache hits this would be true
  };
}

/** Short human-readable string for Telegram / dashboard surfaces. */
export function summarizeContext(ctx: MarketContext): string {
  const parts: string[] = [];
  if (ctx.fearGreed) {
    parts.push(`F&G ${ctx.fearGreed.value} (${ctx.fearGreed.classification})`);
  }
  if (ctx.btcDominance) {
    parts.push(`BTC.D ${ctx.btcDominance.value}%`);
  }
  if (ctx.funding) {
    const pct = (ctx.funding.rate * 100).toFixed(4);
    parts.push(`Funding ${ctx.funding.rate >= 0 ? "+" : ""}${pct}%`);
  }
  return parts.join(" · ");
}
