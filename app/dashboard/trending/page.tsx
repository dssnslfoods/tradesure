import Link from "next/link";
import { getTrendingBuckets, type BinanceTicker } from "@/lib/binance/topMovers";
import TrendingTabs from "./TrendingTabs";

export const dynamic = "force-dynamic";
export const revalidate = 30; // re-render every 30s

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

export default async function TrendingPage() {
  let data;
  let err: string | null = null;
  try {
    data = await getTrendingBuckets(5);
  } catch (e) {
    err = e instanceof Error ? e.message : "fetch failed";
  }

  const fetchedAtStr = data
    ? new Date(data.fetchedAt).toLocaleString("en-GB", { hour12: false })
    : "-";

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">🔥 Trending crypto</h1>
          <p className="mt-1 text-sm text-slate-400">
            Top 5 USDT pairs จาก Binance (24h) — refresh ทุก 30 วินาที · ข้อมูลล่าสุด {fetchedAtStr}
          </p>
        </div>
        <Link
          href="/dashboard"
          className="rounded-lg border border-crypto-border bg-crypto-panel px-4 py-2 text-sm text-slate-200 hover:bg-black/30"
        >
          ← Dashboard
        </Link>
      </header>

      {err && (
        <div className="mb-6 rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-300">
          ❌ ไม่สามารถดึงข้อมูลจาก Binance ได้: {err}
        </div>
      )}

      {data && (
        <TrendingTabs
          buckets={{
            hottest: data.hottest.map(toClient),
            gainers: data.gainers.map(toClient),
            losers: data.losers.map(toClient),
            byVolume: data.byVolume.map(toClient),
          }}
        />
      )}

      <p className="mt-4 text-xs text-slate-500">
        🟢 = pump (+ 24h) · 🔴 = dump (- 24h) · ตัวเลขเป็น quote volume USDT.
        ตัด stablecoin pairs และ leveraged tokens (UP/DOWN/BULL/BEAR) ออก.
      </p>
    </main>
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
}

function toClient(t: BinanceTicker): ClientTicker {
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
  };
}
