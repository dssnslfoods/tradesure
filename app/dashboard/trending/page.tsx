import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth/session";
import { findUserById } from "@/lib/auth/otp";
import {
  fetchSparklines,
  getTrendingBuckets,
  type BinanceTicker,
  type FilterMode,
} from "@/lib/binance/topMovers";
import TrendingTabs from "./TrendingTabs";

export const dynamic = "force-dynamic";
export const revalidate = 30;

function fmtPrice(v: number): string {
  if (v >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (v >= 1) return v.toFixed(4);
  if (v >= 0.01) return v.toFixed(5);
  return v.toFixed(8);
}

function fmtVolume(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(2)}K`;
  return `$${v.toFixed(0)}`;
}

function pctClass(pct: number): string {
  if (pct >= 10) return "text-emerald-200 bg-emerald-500/30 border-emerald-500/50";
  if (pct > 0) return "text-emerald-300 bg-emerald-500/15 border-emerald-500/30";
  if (pct <= -10) return "text-rose-200 bg-rose-500/30 border-rose-500/50";
  if (pct < 0) return "text-rose-300 bg-rose-500/15 border-rose-500/30";
  return "text-slate-300 bg-slate-500/10 border-slate-500/30";
}

const VALID_FILTERS: FilterMode[] = ["all", "blue_chip", "no_meme"];

export default async function TrendingPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const params = await searchParams;
  const filterMode: FilterMode = VALID_FILTERS.includes(params.filter as FilterMode)
    ? (params.filter as FilterMode)
    : "all";

  const c = await cookies();
  const session = await verifySessionToken(c.get(SESSION_COOKIE)?.value ?? null);
  const me = session ? await findUserById(session.uid) : null;

  let data;
  let err: string | null = null;
  try {
    data = await getTrendingBuckets(5, 5_000_000, filterMode);
  } catch (e) {
    err = e instanceof Error ? e.message : "fetch failed";
  }

  // Watchlist
  let watchlist: { symbol: string; base: string }[] = [];
  if (me) {
    const supabase = getSupabaseAdmin();
    const { data: items } = await supabase
      .from("watchlist_items")
      .select("symbol, base")
      .eq("user_id", me.id);
    watchlist = items ?? [];
  }
  const watchlistSet = new Set(watchlist.map((w) => w.symbol));

  // Build watchlist tickers (re-use the live ticker data we already fetched)
  let watchlistTickers: BinanceTicker[] = [];
  if (data && watchlist.length > 0) {
    // We need full ticker data — fetch separately if not already in any bucket
    const allInBuckets = new Map<string, BinanceTicker>();
    [...data.hottest, ...data.gainers, ...data.losers, ...data.byVolume].forEach(
      (t) => allInBuckets.set(t.symbol, t)
    );
    const missing = watchlist
      .filter((w) => !allInBuckets.has(w.symbol))
      .map((w) => w.symbol);

    let extraMap = new Map<string, BinanceTicker>();
    if (missing.length > 0) {
      try {
        const all = await import("@/lib/binance/topMovers").then((m) =>
          m.fetchAllUsdtTickers()
        );
        const allMap = new Map(all.map((t) => [t.symbol, t]));
        missing.forEach((s) => {
          const t = allMap.get(s);
          if (t) extraMap.set(s, t);
        });
      } catch {
        extraMap = new Map();
      }
    }

    watchlistTickers = watchlist
      .map((w) => allInBuckets.get(w.symbol) ?? extraMap.get(w.symbol))
      .filter(Boolean) as BinanceTicker[];
  }

  // Fetch sparklines for all displayed coins (deduped)
  const symbolSet = new Set<string>();
  if (data) {
    [...data.hottest, ...data.gainers, ...data.losers, ...data.byVolume, ...watchlistTickers].forEach(
      (t) => symbolSet.add(t.symbol)
    );
  }
  const sparklines = symbolSet.size > 0
    ? await fetchSparklines([...symbolSet])
    : {};

  const fetchedAtStr = data
    ? new Date(data.fetchedAt).toLocaleString("en-GB", { hour12: false })
    : "-";

  return (
    <>
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Live · Binance USDT pairs</div>
          <h1 className="mt-1 text-[24px] font-bold tracking-tightest text-ink-primary sm:text-[32px]">
            Trending Crypto
          </h1>
          <p className="mt-1 text-[13px] text-ink-secondary">
            Top 5 ในแต่ละหมวด · refresh ทุก 30 วินาที · ข้อมูลล่าสุด{" "}
            <span className="font-mono text-ink-primary">{fetchedAtStr}</span>
          </p>
        </div>
      </header>

      {err && (
        <div className="mb-6 rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-300">
          ❌ ไม่สามารถดึงข้อมูลจาก Binance ได้: {err}
        </div>
      )}

      {data && (
        <TrendingTabs
          buckets={{
            hottest: data.hottest.map((t) => toClient(t, sparklines[t.symbol], watchlistSet)),
            gainers: data.gainers.map((t) => toClient(t, sparklines[t.symbol], watchlistSet)),
            losers: data.losers.map((t) => toClient(t, sparklines[t.symbol], watchlistSet)),
            byVolume: data.byVolume.map((t) => toClient(t, sparklines[t.symbol], watchlistSet)),
            watchlist: watchlistTickers.map((t) =>
              toClient(t, sparklines[t.symbol], watchlistSet)
            ),
          }}
          filter={filterMode}
        />
      )}

      <p className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-ink-muted">
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-sig-buy" />
          pump (+24h)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-sig-sell" />
          dump (-24h)
        </span>
        <span className="text-ink-faint">·</span>
        <span>ตัวเลขเป็น quote volume USDT — ตัด stablecoin + leveraged tokens (UP/DOWN/BULL/BEAR)</span>
      </p>
    </>
  );
}

export interface ClientTicker {
  symbol: string;
  base: string;
  lastPrice: number;
  lastPriceFmt: string;
  priceChangePercent: number;
  quoteVolume: number;
  quoteVolumeFmt: string;
  highPrice: number;
  lowPrice: number;
  count: number;
  pctClass: string;
  tag: "blue_chip" | "memecoin" | "other";
  sparkline: number[];
  inWatchlist: boolean;
}

function toClient(
  t: BinanceTicker,
  sparkline: number[] | undefined,
  watchlistSet: Set<string>
): ClientTicker {
  return {
    symbol: t.symbol,
    base: t.base,
    lastPrice: t.lastPrice,
    lastPriceFmt: fmtPrice(t.lastPrice),
    priceChangePercent: t.priceChangePercent,
    quoteVolume: t.quoteVolume,
    quoteVolumeFmt: fmtVolume(t.quoteVolume),
    highPrice: t.highPrice,
    lowPrice: t.lowPrice,
    count: t.count,
    pctClass: pctClass(t.priceChangePercent),
    tag: t.tag,
    sparkline: sparkline ?? [],
    inWatchlist: watchlistSet.has(t.symbol),
  };
}
