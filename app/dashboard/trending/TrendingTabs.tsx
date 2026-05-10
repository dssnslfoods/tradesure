"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ClientTicker } from "./page";

type TabKey = "hottest" | "gainers" | "byVolume" | "losers";

const TABS: { key: TabKey; label: string; icon: string; desc: string }[] = [
  { key: "hottest", label: "Hottest", icon: "🔥", desc: "ราคาขึ้น × volume สูง" },
  { key: "gainers", label: "Top gainers", icon: "🚀", desc: "ราคาขึ้นมากสุด 24h" },
  { key: "byVolume", label: "Most traded", icon: "💧", desc: "Volume สูงสุด 24h" },
  { key: "losers", label: "Top losers", icon: "📉", desc: "ราคาลงมากสุด 24h" },
];

export default function TrendingTabs({
  buckets,
}: {
  buckets: Record<TabKey, ClientTicker[]>;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("hottest");
  const [secondsLeft, setSecondsLeft] = useState(30);

  // Auto-refresh countdown
  useEffect(() => {
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          router.refresh();
          return 30;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [router]);

  const list = buckets[tab];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                tab === t.key
                  ? "border-crypto-accent bg-crypto-accent/20 text-crypto-accent"
                  : "border-crypto-border bg-crypto-panel text-slate-300 hover:bg-black/30"
              }`}
              title={t.desc}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        <div className="text-xs text-slate-500">
          ⏱ refresh ใน <span className="tabular-nums text-slate-300">{secondsLeft}s</span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {list.map((t, i) => (
          <CoinCard key={t.symbol} ticker={t} rank={i + 1} />
        ))}
      </div>
    </>
  );
}

function CoinCard({ ticker, rank }: { ticker: ClientTicker; rank: number }) {
  const tvUrl = `https://www.tradingview.com/chart/?symbol=BINANCE:${encodeURIComponent(
    ticker.symbol
  )}`;
  const binanceUrl = `https://www.binance.com/en/trade/${ticker.base}_USDT?type=spot`;

  const sign = ticker.priceChangePercent >= 0 ? "+" : "";

  return (
    <div className="group relative overflow-hidden rounded-xl border border-crypto-border bg-crypto-panel p-4 shadow-lg transition hover:border-crypto-accent/40">
      <div className="absolute -right-3 -top-3 select-none text-6xl font-black opacity-5">
        {rank}
      </div>

      <div className="mb-3 flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500">#{rank}</div>
          <div className="mt-0.5 text-xl font-bold text-slate-100">{ticker.base}</div>
          <div className="text-[10px] text-slate-500">{ticker.symbol}</div>
        </div>
        <span
          className={`rounded-md border px-2 py-1 text-xs font-bold ${ticker.pctClass}`}
        >
          {sign}
          {ticker.priceChangePercent.toFixed(2)}%
        </span>
      </div>

      <div className="space-y-1.5">
        <Row label="ราคา" value={`$${ticker.lastPriceFmt}`} bold />
        <Row label="High 24h" value={`$${formatPrice(ticker.highPrice)}`} />
        <Row label="Low 24h" value={`$${formatPrice(ticker.lowPrice)}`} />
        <Row label="Volume" value={ticker.quoteVolumeFmt} />
        <Row label="Trades" value={ticker.count.toLocaleString("en-US")} />
      </div>

      <div className="mt-3 flex gap-2 border-t border-crypto-border pt-3">
        <a
          href={tvUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-center text-xs font-semibold text-sky-300 hover:bg-sky-500/20"
        >
          📊 Chart
        </a>
        <a
          href={binanceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-center text-xs font-semibold text-amber-300 hover:bg-amber-500/20"
        >
          💱 Binance
        </a>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between text-sm">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`tabular-nums ${bold ? "font-semibold text-slate-100" : "text-slate-300"}`}>
        {value}
      </span>
    </div>
  );
}

function formatPrice(v: number): string {
  if (v >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (v >= 1) return v.toFixed(4);
  if (v >= 0.01) return v.toFixed(5);
  return v.toFixed(8);
}
