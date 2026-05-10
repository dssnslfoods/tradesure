"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { ClientTicker } from "./page";
import {
  addToWatchlist,
  analyzeTrendingCoin,
  removeFromWatchlist,
} from "./actions";
import Sparkline from "@/components/ui/Sparkline";
import Icon, { type IconName } from "@/components/ui/Icon";

type TabKey = "hottest" | "gainers" | "byVolume" | "losers" | "watchlist";
type FilterMode = "all" | "blue_chip" | "no_meme";

const TABS: {
  key: TabKey;
  label: string;
  icon: IconName;
  desc: string;
}[] = [
  { key: "hottest", label: "Hottest", icon: "flame", desc: "ราคาขึ้น × volume สูง" },
  { key: "gainers", label: "Top gainers", icon: "trending-up", desc: "ราคาขึ้นมากสุด 24h" },
  { key: "byVolume", label: "Most traded", icon: "droplet", desc: "Volume สูงสุด 24h" },
  { key: "losers", label: "Top losers", icon: "trending-down", desc: "ราคาลงมากสุด 24h" },
  { key: "watchlist", label: "Watchlist", icon: "star", desc: "เหรียญที่บันทึกไว้" },
];

const FILTERS: { key: FilterMode; label: string; icon: IconName }[] = [
  { key: "all", label: "All", icon: "globe" },
  { key: "no_meme", label: "No memecoins", icon: "ban" },
  { key: "blue_chip", label: "Blue chips", icon: "diamond" },
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
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`chip transition !text-[12px] !px-3 !py-1.5 ${
                  active
                    ? "!bg-brand/15 !text-brand !border-brand/40"
                    : "hover:!bg-surface-2 hover:!text-ink-primary"
                }`}
                title={t.desc}
              >
                <Icon name={t.icon} size={13} />
                {t.label}
                {t.key === "watchlist" && buckets.watchlist.length > 0 && (
                  <span className="ml-1 rounded bg-sig-warn/30 px-1.5 py-0.5 text-[9px] font-bold text-sig-warn">
                    {buckets.watchlist.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 rounded-chip border border-white/5 bg-surface-1/60 px-3 py-1.5 text-[11px] text-ink-muted">
          <span className="pulse-dot" />
          Refresh in <span className="tabular text-ink-primary">{secondsLeft}s</span>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2 text-[11px]">
        <span className="text-ink-muted">Filter:</span>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`chip !text-[11px] !py-1 transition ${
                active
                  ? "!bg-sig-info/15 !text-sig-info !border-sig-info/40"
                  : "hover:!bg-surface-2 hover:!text-ink-primary"
              }`}
            >
              <Icon name={f.icon} size={12} />
              {f.label}
            </button>
          );
        })}
      </div>

      {list.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-ink-muted">
            <Icon name={tab === "watchlist" ? "star" : "wave"} size={22} />
          </span>
          <div className="text-[15px] font-semibold text-ink-secondary">
            {tab === "watchlist"
              ? "ยังไม่มีเหรียญใน watchlist"
              : "ไม่มีข้อมูลตาม filter ที่เลือก"}
          </div>
          {tab === "watchlist" && (
            <div className="mt-1 text-[12px] text-ink-muted">
              กดดาว ☆ บนการ์ดเพื่อเพิ่ม
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {list.map((t, i) => (
            <TokenCard
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
            className={`flex items-start gap-3 rounded-card border px-4 py-3 shadow-card backdrop-blur-glass ${
              toast.tone === "success"
                ? "border-sig-buy/40 bg-sig-buy/15 text-sig-buy"
                : "border-sig-sell/40 bg-sig-sell/15 text-sig-sell"
            }`}
          >
            <Icon
              name={toast.tone === "success" ? "circle-check" : "alert-triangle"}
              size={16}
              className="mt-0.5"
            />
            <span className="flex-1 text-[13px]">{toast.text}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="text-ink-muted hover:text-ink-primary"
              aria-label="Close"
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function TokenCard({
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
  const [pending, start] = useTransition();
  const positive = ticker.priceChangePercent >= 0;
  const sign = positive ? "+" : "";
  const tvUrl = `https://www.tradingview.com/chart/?symbol=BINANCE:${encodeURIComponent(ticker.symbol)}`;
  const binanceUrl = `https://www.binance.com/en/trade/${ticker.base}_USDT?type=spot`;

  const onToggleWatch = () => {
    start(async () => {
      const res = ticker.inWatchlist
        ? await removeFromWatchlist(ticker.symbol)
        : await addToWatchlist(ticker.symbol, ticker.base);
      if (res.ok) {
        onToast({
          tone: "success",
          text: ticker.inWatchlist
            ? `Removed ${ticker.base} from watchlist`
            : `Added ${ticker.base} to watchlist`,
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
    start(async () => {
      const res = await analyzeTrendingCoin({
        symbol: ticker.symbol,
        hint: ticker.priceChangePercent >= 0 ? "BUY" : "SELL",
      });
      if (res.ok) {
        onToast({
          tone: "success",
          text: `AI วิเคราะห์ ${ticker.base} เสร็จ (bias: ${res.bias}, conf: ${res.confidence}%) ${
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
      ? { text: "Blue chip", icon: "diamond" as IconName, cls: "!bg-sig-info/15 !text-sig-info !border-sig-info/30" }
      : ticker.tag === "memecoin"
      ? { text: "Memecoin", icon: "alert-triangle" as IconName, cls: "!bg-sig-violet/15 !text-sig-violet !border-sig-violet/30" }
      : null;

  return (
    <div className="card relative overflow-hidden p-[18px] transition hover:-translate-y-0.5 hover:border-strong">
      {showRank && (
        <span className="pointer-events-none absolute -right-3 -top-2 select-none text-[80px] font-black text-white/[0.03]">
          {rank}
        </span>
      )}

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {showRank && (
            <div className="text-[9px] uppercase tracking-eyebrow text-ink-faint">#{rank}</div>
          )}
          <div className="mt-0.5 flex items-center gap-2">
            <span className="text-[18px] font-bold tracking-tightest text-ink-primary">
              {ticker.base}
            </span>
            <button
              type="button"
              onClick={onToggleWatch}
              disabled={pending}
              className={`flex h-6 w-6 items-center justify-center rounded transition ${
                ticker.inWatchlist
                  ? "text-sig-warn"
                  : "text-ink-faint hover:text-sig-warn"
              }`}
              aria-label={ticker.inWatchlist ? "Remove from watchlist" : "Add to watchlist"}
            >
              <Icon name={ticker.inWatchlist ? "star-filled" : "star"} size={15} />
            </button>
          </div>
          <div className="font-mono text-[10px] text-ink-muted">{ticker.symbol}</div>
        </div>
        <span
          className={`chip !text-[11px] !py-1 !px-2 ${
            positive ? "chip-buy" : "chip-sell"
          }`}
        >
          <Icon name={positive ? "arrow-up-right" : "arrow-down-right"} size={10} />
          {sign}
          {ticker.priceChangePercent.toFixed(2)}%
        </span>
      </div>

      {tagBadge && (
        <div className="mt-2">
          <span className={`chip !text-[10px] !py-0.5 !px-1.5 ${tagBadge.cls}`}>
            <Icon name={tagBadge.icon} size={10} />
            {tagBadge.text}
          </span>
        </div>
      )}

      <div className="-mx-1 mt-3">
        <Sparkline
          data={ticker.sparkline}
          width={240}
          height={56}
          color={positive ? "var(--accent)" : "var(--sell)"}
        />
      </div>

      <div className="mt-3 space-y-1.5 text-[12px]">
        <KV label="ราคา" value={`$${ticker.lastPriceFmt}`} bold />
        <KV label="High 24h" value={`$${formatPrice(ticker.highPrice)}`} />
        <KV label="Low 24h" value={`$${formatPrice(ticker.lowPrice)}`} />
        <KV label="Volume" value={ticker.quoteVolumeFmt} />
        <KV label="Trades" value={ticker.count.toLocaleString("en-US")} />
      </div>

      <div className="mt-4 space-y-2 border-t border-white/5 pt-3">
        <button
          type="button"
          onClick={onAnalyze}
          disabled={pending}
          className="btn btn-primary w-full justify-center !py-2 !text-[12px] disabled:opacity-50"
        >
          <Icon name="robot" size={14} />
          {pending ? "Working…" : "Analyze with AI"}
        </button>
        <div className="flex gap-2">
          <a
            href={tvUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost flex-1 justify-center !py-1.5 !text-[11px]"
          >
            <Icon name="chart-candle" size={12} />
            Chart
          </a>
          <a
            href={binanceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost flex-1 justify-center !py-1.5 !text-[11px]"
          >
            <Icon name="external" size={12} />
            Binance
          </a>
        </div>
      </div>
    </div>
  );
}

function KV({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[10px] text-ink-muted">{label}</span>
      <span
        className={`font-mono tabular ${
          bold ? "font-semibold text-ink-primary" : "text-ink-secondary"
        }`}
      >
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
