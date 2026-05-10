"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { ClientTicker } from "./page";
import {
  addToWatchlist,
  analyzeTrendingCoin,
  removeFromWatchlist,
} from "./actions";
import Sparkline from "./Sparkline";

type TabKey = "hottest" | "gainers" | "byVolume" | "losers" | "watchlist";
type FilterMode = "all" | "blue_chip" | "no_meme";

const TABS: { key: TabKey; label: string; icon: string; desc: string }[] = [
  { key: "hottest", label: "Hottest", icon: "🔥", desc: "ราคาขึ้น × volume สูง" },
  { key: "gainers", label: "Top gainers", icon: "🚀", desc: "ราคาขึ้นมากสุด 24h" },
  { key: "byVolume", label: "Most traded", icon: "💧", desc: "Volume สูงสุด 24h" },
  { key: "losers", label: "Top losers", icon: "📉", desc: "ราคาลงมากสุด 24h" },
  { key: "watchlist", label: "Watchlist", icon: "⭐", desc: "เหรียญที่บันทึกไว้" },
];

const FILTERS: { key: FilterMode; label: string; icon: string }[] = [
  { key: "all", label: "All", icon: "🌐" },
  { key: "no_meme", label: "ไม่รวม memecoin", icon: "🚫" },
  { key: "blue_chip", label: "Blue chips", icon: "💎" },
];

export default function TrendingTabs({
  buckets,
  filter,
}: {
  buckets: Record<TabKey, ClientTicker[]>;
  filter: FilterMode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState<TabKey>("hottest");
  const [secondsLeft, setSecondsLeft] = useState(30);
  const [toast, setToast] = useState<{ tone: "success" | "error"; text: string } | null>(null);

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

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const setFilter = (f: FilterMode) => {
    const params = new URLSearchParams();
    if (f !== "all") params.set("filter", f);
    const qs = params.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`);
  };

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
              {t.key === "watchlist" && buckets.watchlist.length > 0 && (
                <span className="ml-1.5 rounded bg-amber-500/30 px-1.5 py-0.5 text-[10px] font-bold text-amber-200">
                  {buckets.watchlist.length}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="text-xs text-slate-500">
          ⏱ refresh ใน <span className="tabular-nums text-slate-300">{secondsLeft}s</span>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-500">Filter:</span>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-md border px-2 py-1 font-semibold transition ${
              filter === f.key
                ? "border-sky-500/50 bg-sky-500/15 text-sky-300"
                : "border-crypto-border bg-crypto-panel text-slate-400 hover:bg-black/30"
            }`}
          >
            {f.icon} {f.label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl border border-crypto-border bg-crypto-panel p-12 text-center text-sm text-slate-500">
          {tab === "watchlist"
            ? "ยังไม่มีเหรียญใน watchlist — กด ⭐ บนการ์ดเพื่อเพิ่ม"
            : "ไม่มีข้อมูลตาม filter ที่เลือก"}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {list.map((t, i) => (
            <CoinCard
              key={t.symbol}
              ticker={t}
              rank={i + 1}
              showRank={tab !== "watchlist"}
              onToast={setToast}
            />
          ))}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md">
          <div
            className={`flex items-start gap-3 rounded-lg border px-4 py-3 shadow-xl ${
              toast.tone === "success"
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
                : "border-rose-500/40 bg-rose-500/15 text-rose-200"
            }`}
          >
            <span className="flex-1 text-sm">{toast.text}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="text-xs opacity-60 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function CoinCard({
  ticker,
  rank,
  showRank,
  onToast,
}: {
  ticker: ClientTicker;
  rank: number;
  showRank: boolean;
  onToast: (t: { tone: "success" | "error"; text: string }) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const tvUrl = `https://www.tradingview.com/chart/?symbol=BINANCE:${encodeURIComponent(
    ticker.symbol
  )}`;
  const binanceUrl = `https://www.binance.com/en/trade/${ticker.base}_USDT?type=spot`;
  const sign = ticker.priceChangePercent >= 0 ? "+" : "";

  const onToggleWatch = () => {
    startTransition(async () => {
      const res = ticker.inWatchlist
        ? await removeFromWatchlist(ticker.symbol)
        : await addToWatchlist(ticker.symbol, ticker.base);
      if (res.ok) {
        onToast({
          tone: "success",
          text: ticker.inWatchlist
            ? `🗑 เอา ${ticker.base} ออกจาก watchlist`
            : `⭐ เพิ่ม ${ticker.base} เข้า watchlist`,
        });
        router.refresh();
      } else {
        onToast({ tone: "error", text: res.error ?? "failed" });
      }
    });
  };

  const onAnalyze = () => {
    if (!confirm(`ให้ AI วิเคราะห์ ${ticker.base} แล้วส่ง signal เข้า Telegram + dashboard?`))
      return;
    startTransition(async () => {
      const res = await analyzeTrendingCoin({
        symbol: ticker.symbol,
        hint: ticker.priceChangePercent >= 0 ? "BUY" : "SELL",
      });
      if (res.ok) {
        onToast({
          tone: "success",
          text: `🤖 AI วิเคราะห์ ${ticker.base} เสร็จ (bias: ${res.bias}, conf: ${res.confidence}%) ${
            res.telegram_sent ? "· ส่ง Telegram แล้ว" : ""
          }`,
        });
      } else {
        onToast({ tone: "error", text: res.error ?? "failed" });
      }
    });
  };

  const tagBadge =
    ticker.tag === "blue_chip"
      ? { text: "💎 blue chip", cls: "bg-sky-500/20 text-sky-300" }
      : ticker.tag === "memecoin"
      ? { text: "🐶 memecoin", cls: "bg-pink-500/20 text-pink-300" }
      : null;

  return (
    <div className="group relative overflow-hidden rounded-xl border border-crypto-border bg-crypto-panel p-4 shadow-lg transition hover:border-crypto-accent/40">
      {showRank && (
        <div className="absolute -right-3 -top-3 select-none text-6xl font-black opacity-5">
          {rank}
        </div>
      )}

      <div className="mb-2 flex items-start justify-between">
        <div>
          {showRank && (
            <div className="text-xs uppercase tracking-wider text-slate-500">#{rank}</div>
          )}
          <div className="mt-0.5 flex items-center gap-2">
            <div className="text-xl font-bold text-slate-100">{ticker.base}</div>
            <button
              type="button"
              onClick={onToggleWatch}
              disabled={pending}
              className={`text-lg leading-none transition ${
                ticker.inWatchlist ? "text-amber-300" : "text-slate-600 hover:text-amber-300"
              }`}
              title={ticker.inWatchlist ? "เอาออกจาก watchlist" : "เพิ่มเข้า watchlist"}
            >
              {ticker.inWatchlist ? "★" : "☆"}
            </button>
          </div>
          <div className="text-[10px] text-slate-500">{ticker.symbol}</div>
        </div>
        <span
          className={`rounded-md border px-2 py-1 text-xs font-bold ${ticker.pctClass}`}
        >
          {sign}
          {ticker.priceChangePercent.toFixed(2)}%
        </span>
      </div>

      {tagBadge && (
        <div className="mb-2">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${tagBadge.cls}`}>
            {tagBadge.text}
          </span>
        </div>
      )}

      <div className="mb-3 -mx-2">
        <Sparkline
          data={ticker.sparkline}
          width={200}
          height={40}
          positive={ticker.priceChangePercent >= 0}
        />
      </div>

      <div className="space-y-1.5">
        <Row label="ราคา" value={`$${ticker.lastPriceFmt}`} bold />
        <Row label="High 24h" value={`$${formatPrice(ticker.highPrice)}`} />
        <Row label="Low 24h" value={`$${formatPrice(ticker.lowPrice)}`} />
        <Row label="Volume" value={ticker.quoteVolumeFmt} />
        <Row label="Trades" value={ticker.count.toLocaleString("en-US")} />
      </div>

      <div className="mt-3 space-y-2 border-t border-crypto-border pt-3">
        <button
          type="button"
          onClick={onAnalyze}
          disabled={pending}
          className="w-full rounded-md border border-crypto-accent/40 bg-crypto-accent/10 px-2 py-1.5 text-xs font-semibold text-crypto-accent hover:bg-crypto-accent/20 disabled:opacity-40"
        >
          {pending ? "…" : "🤖 Analyze with AI"}
        </button>
        <div className="flex gap-2">
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
