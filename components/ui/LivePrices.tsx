"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";

interface Ticker {
  symbol: string;
  base: string;
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
}

interface RawTicker {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
}

const REFRESH_MS = 5000;

function fmtPrice(v: number): string {
  if (v >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (v >= 1) return v.toFixed(4);
  if (v >= 0.01) return v.toFixed(5);
  return v.toFixed(8);
}

export default function LivePrices({ symbols }: { symbols: string[] }) {
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [lastUpdate, setLastUpdate] = useState<number>(0);
  const [secondsLeft, setSecondsLeft] = useState(REFRESH_MS / 1000);
  const [error, setError] = useState<string | null>(null);
  const prevPrices = useRef<Record<string, number>>({});
  const flashes = useRef<Record<string, "up" | "down" | null>>({});

  // Dedupe + uppercase
  const uniqueSymbols = Array.from(new Set(symbols.map((s) => s.toUpperCase()))).filter(
    (s) => s.endsWith("USDT")
  );

  const symbolKey = uniqueSymbols.join(",");

  useEffect(() => {
    if (uniqueSymbols.length === 0) return;

    let cancelled = false;
    const fetchPrices = async () => {
      try {
        const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(
          JSON.stringify(uniqueSymbols)
        )}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = (await res.json()) as RawTicker[];
        if (cancelled) return;

        const next = raw.map((r) => ({
          symbol: r.symbol,
          base: r.symbol.replace(/USDT$/, ""),
          price: Number(r.lastPrice),
          change24h: Number(r.priceChangePercent),
          high24h: Number(r.highPrice),
          low24h: Number(r.lowPrice),
        }));

        // Detect price flash direction
        next.forEach((t) => {
          const prev = prevPrices.current[t.symbol];
          if (prev !== undefined && prev !== t.price) {
            flashes.current[t.symbol] = t.price > prev ? "up" : "down";
          }
          prevPrices.current[t.symbol] = t.price;
        });

        setTickers(next);
        setLastUpdate(Date.now());
        setSecondsLeft(REFRESH_MS / 1000);
        setError(null);

        // Clear flashes after animation
        setTimeout(() => {
          flashes.current = {};
          if (!cancelled) setTickers((prev) => [...prev]); // force re-render
        }, 600);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "fetch failed");
      }
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, REFRESH_MS);
    const tick = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolKey]);

  if (uniqueSymbols.length === 0) return null;

  return (
    <div className="card overflow-hidden p-0">
      <div className="flex items-center gap-3 border-b border-white/5 bg-surface-2/30 px-4 py-2 text-[11px]">
        <span className="pulse-dot" />
        <span className="eyebrow !text-[10px]">Live · Binance</span>
        {error ? (
          <span className="text-sig-sell">{error}</span>
        ) : (
          <span className="ml-auto font-mono text-ink-muted">
            Refresh in {secondsLeft}s · {uniqueSymbols.length} pair{uniqueSymbols.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto px-3 py-3">
        {tickers.length === 0 ? (
          // Loading skeletons
          uniqueSymbols.map((s) => (
            <div
              key={s}
              className="flex shrink-0 items-center gap-3 rounded-chip bg-surface-2/40 px-3 py-2"
            >
              <span className="h-7 w-7 animate-pulse rounded-full bg-surface-3" />
              <div className="space-y-1">
                <div className="h-3 w-12 animate-pulse rounded bg-surface-3" />
                <div className="h-3 w-16 animate-pulse rounded bg-surface-3" />
              </div>
            </div>
          ))
        ) : (
          tickers.map((t) => <PriceChip key={t.symbol} ticker={t} flash={flashes.current[t.symbol]} />)
        )}
      </div>
    </div>
  );
}

function PriceChip({
  ticker,
  flash,
}: {
  ticker: Ticker;
  flash: "up" | "down" | null | undefined;
}) {
  const positive = ticker.change24h >= 0;
  const flashCls =
    flash === "up"
      ? "ring-2 ring-sig-buy/60"
      : flash === "down"
      ? "ring-2 ring-sig-sell/60"
      : "";

  return (
    <div
      className={`group flex shrink-0 items-center gap-3 rounded-chip border border-white/5 bg-surface-2/40 px-3 py-2 transition-all hover:bg-surface-3 ${flashCls}`}
    >
      <span
        className="flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold tracking-tightest"
        style={{
          background: positive
            ? "linear-gradient(135deg, rgba(0,212,170,0.25), rgba(0,212,170,0.1))"
            : "linear-gradient(135deg, rgba(255,85,119,0.25), rgba(255,85,119,0.1))",
          color: positive ? "var(--accent-hi)" : "#ff8aa3",
        }}
      >
        {ticker.base.slice(0, 3)}
      </span>
      <div className="leading-tight">
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-bold text-ink-primary">{ticker.base}</span>
          <span className="font-mono text-[9px] text-ink-faint">USDT</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`font-mono tabular text-[13px] font-semibold transition-colors ${
              flash === "up"
                ? "text-sig-buy"
                : flash === "down"
                ? "text-sig-sell"
                : "text-ink-primary"
            }`}
          >
            ${fmtPrice(ticker.price)}
          </span>
          <span
            className={`font-mono tabular text-[10px] font-semibold ${
              positive ? "text-sig-buy" : "text-sig-sell"
            }`}
          >
            <Icon
              name={positive ? "arrow-up-right" : "arrow-down-right"}
              size={10}
              className="inline -mt-0.5"
            />
            {positive ? "+" : ""}
            {ticker.change24h.toFixed(2)}%
          </span>
        </div>
      </div>
    </div>
  );
}
