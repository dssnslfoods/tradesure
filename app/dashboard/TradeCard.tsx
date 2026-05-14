"use client";

import Icon from "@/components/ui/Icon";
import Sparkline from "@/components/ui/Sparkline";
import ConfidenceMeter from "@/components/ui/ConfidenceMeter";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSignal } from "./actions";
import type { SignalRow } from "./SignalsTable";

function fmtPrice(v: number | null): string {
  if (v === null || v === undefined) return "-";
  if (v >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (v >= 1) return v.toFixed(4);
  return v.toFixed(8);
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { hour12: false });
}

function fmtPnl(p: number | null): string {
  if (p === null || p === undefined) return "—";
  const sign = p >= 0 ? "+" : "";
  return `${sign}${p.toFixed(2)}%`;
}

function entryMid(r: SignalRow): number | null {
  if (r.entry_low !== null && r.entry_high !== null)
    return (r.entry_low + r.entry_high) / 2;
  return r.tv_price;
}

function rrRatio(r: SignalRow): number | null {
  const e = entryMid(r);
  const sl = r.stop_loss_num;
  const tp1 = r.take_profit_1_num;
  if (e === null || sl === null || tp1 === null) return null;
  const risk = Math.abs(e - sl);
  const reward = Math.abs(tp1 - e);
  if (risk === 0) return null;
  return Math.round((reward / risk) * 100) / 100;
}

interface OutcomeMeta {
  chip: string;
  label: string;
}

function outcomeMeta(o: string | null): OutcomeMeta {
  switch (o) {
    case "WIN_TP1":
      return { chip: "chip-buy", label: "TP1 hit" };
    case "WIN_TP2":
      return { chip: "chip-buy", label: "TP2 hit" };
    case "LOSS_SL":
      return { chip: "chip-sell", label: "SL hit" };
    case "OPEN":
      return { chip: "chip-info", label: "Open" };
    case "PENDING":
      return { chip: "chip-mute", label: "Pending" };
    case "QUEUED":
      return { chip: "chip-info", label: "Queued" };
    case "SKIP_WAIT":
      return { chip: "chip-warn", label: "No Trade" };
    case "SKIP_LOW_CONF":
      return { chip: "chip-warn", label: "Low conf" };
    case "SKIP_HOUR":
      return { chip: "chip-warn", label: "Off-hour" };
    case "NO_DATA":
    case "ERROR":
      return { chip: "chip-mute", label: "No data" };
    default:
      return { chip: "chip-mute", label: "—" };
  }
}

export default function TradeCard({
  row,
  isAdmin,
  onEdit,
  isNew,
  sparkline,
}: {
  row: SignalRow;
  isAdmin: boolean;
  onEdit: () => void;
  isNew?: boolean;
  sparkline?: number[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const om = outcomeMeta(row.outcome);
  const rr = rrRatio(row);
  const entry = entryMid(row);
  const direction =
    row.bias === "LONG" || row.tv_signal?.toUpperCase() === "BUY" ? "LONG" : "SHORT";

  const onDelete = () => {
    if (!confirm(`ลบ signal ${row.symbol} ${fmtTime(row.created_at)}?`)) return;
    start(async () => {
      const res = await deleteSignal(row.signal_id);
      if (res.ok) router.refresh();
      else alert(res.error ?? "failed");
    });
  };

  const isWin = row.outcome === "WIN_TP1" || row.outcome === "WIN_TP2";
  const isLoss = row.outcome === "LOSS_SL";

  const sparkColor = isWin
    ? "var(--buy)"
    : isLoss
    ? "var(--sell)"
    : direction === "LONG"
    ? "var(--accent)"
    : "var(--info)";

  // Watermark based on outcome — semi-transparent diagonal label across the card
  const watermark =
    row.outcome === "WIN_TP2"
      ? { text: "ALL WIN", color: "var(--buy)" }
      : row.outcome === "WIN_TP1"
      ? { text: "WIN TP1", color: "var(--buy)" }
      : row.outcome === "LOSS_SL"
      ? { text: "LOSE", color: "var(--sell)" }
      : null;

  return (
    <div
      className={`card relative overflow-hidden p-[18px] ${isNew ? "is-new shimmer" : ""}`}
    >
      {/* Outcome watermark */}
      {watermark && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center overflow-hidden"
        >
          <span
            className="select-none whitespace-nowrap font-black tracking-[0.2em]"
            style={{
              fontSize: "clamp(48px, 14vw, 88px)",
              color: watermark.color,
              opacity: 0.09,
              transform: "rotate(-14deg)",
              textShadow: `0 0 60px ${watermark.color}`,
              WebkitTextStroke: `1px ${watermark.color}`,
            }}
          >
            {watermark.text}
          </span>
        </div>
      )}

      {/* Content wrapper above watermark */}
      <div className="relative z-[2]">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-[10px] text-[11px] font-bold"
            style={{
              background:
                "linear-gradient(135deg, rgba(0,212,170,0.25), rgba(90,162,255,0.15))",
              color: "var(--accent-hi)",
            }}
          >
            {row.symbol.replace("USDT", "").slice(0, 3)}
          </span>
          <div className="leading-tight">
            <div className="flex items-center gap-2">
              <span className="font-bold text-ink-primary">{row.symbol}</span>
              <span className="chip chip-mute !py-0.5 !px-1.5 !text-[10px]">
                {row.interval}
              </span>
              {(row.signal_type ?? "swing") === "intraday" ? (
                <span
                  className="chip !py-0.5 !px-1.5 !text-[10px] !border-sig-violet/40 !bg-sig-violet/15 !text-sig-violet"
                  title="Intraday plan (Pine v3, 15m)"
                >
                  🟣 Intraday
                </span>
              ) : (
                <span
                  className="chip !py-0.5 !px-1.5 !text-[10px] !border-sig-info/40 !bg-sig-info/15 !text-sig-info"
                  title="Swing plan (Pine v2.1, 1H)"
                >
                  🔵 Swing
                </span>
              )}
            </div>
            <div className="mt-1 font-mono text-[10px] text-ink-muted">
              {fmtTime(row.created_at)}
            </div>
          </div>
        </div>
        <span className={`chip ${om.chip}`}>
          {isNew && <span className="pulse-dot !h-1.5 !w-1.5" />}
          {om.label}
        </span>
      </div>

      {/* Direction + Price + Sparkline */}
      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <span
            className={`chip ${direction === "LONG" ? "chip-buy" : "chip-sell"} !text-[11px]`}
          >
            <Icon
              name={direction === "LONG" ? "trending-up" : "trending-down"}
              size={12}
            />
            {row.tv_signal ?? direction}
          </span>
          <div className="mt-2 font-mono text-[26px] font-bold tracking-tightest text-ink-primary">
            ${fmtPrice(row.tv_price)}
          </div>
        </div>
        {sparkline && sparkline.length > 1 && (
          <Sparkline data={sparkline} width={130} height={44} color={sparkColor} />
        )}
      </div>

      {/* AI verdict */}
      <div className="mt-4 flex items-center gap-2 rounded-chip bg-surface-2/60 px-3 py-2">
        <Icon name="robot" size={14} className="text-sig-violet" />
        <span
          className={`chip !text-[10px] !py-0.5 !px-2 ${
            row.bias === "LONG"
              ? "chip-buy"
              : row.bias === "SHORT"
              ? "chip-sell"
              : "chip-warn"
          }`}
        >
          {row.bias ?? "—"}
        </span>
        {row.confidence !== null && <ConfidenceMeter value={row.confidence} />}
        <span className="ml-auto font-mono text-[11px] text-ink-secondary">
          R:R{" "}
          <span className="font-semibold text-ink-primary">
            {rr === null ? "—" : `${rr.toFixed(2)}:1`}
          </span>
        </span>
      </div>

      {/* Levels */}
      <div className="mt-3 grid grid-cols-4 gap-2">
        <Level label="ENTRY" value={fmtPrice(entry)} />
        <Level label="SL" value={fmtPrice(row.stop_loss_num)} tone="sell" />
        <Level
          label="TP1"
          value={fmtPrice(row.take_profit_1_num)}
          tone="buy"
        />
        <Level
          label="TP2"
          value={fmtPrice(row.take_profit_2_num)}
          tone="buy"
        />
      </div>

      {/* Footer */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-3">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-muted">
          {row.telegram_sent ? (
            <>
              <Icon name="telegram" size={12} className="text-sig-info" />
              <span>Sent to Telegram</span>
            </>
          ) : (
            <>
              <Icon name="circle-x" size={12} className="text-sig-sell" />
              <span>Telegram failed</span>
            </>
          )}
          <span className="text-ink-faint">·</span>
          <span
            className={`font-semibold ${
              row.pnl_pct === null
                ? "text-ink-muted"
                : row.pnl_pct >= 0
                ? "text-sig-buy"
                : "text-sig-sell"
            }`}
          >
            {fmtPnl(row.pnl_pct)}
          </span>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-1">
            <IconButton
              onClick={onEdit}
              disabled={pending}
              tone="info"
              aria-label="Edit levels"
            >
              <Icon name="edit" size={14} />
            </IconButton>
            <a
              href={`https://www.tradingview.com/chart/?symbol=BINANCE:${row.symbol}`}
              target="_blank"
              rel="noreferrer"
              className="flex h-7 w-7 items-center justify-center rounded border border-white/5 bg-surface-2 text-ink-secondary transition hover:bg-surface-3 hover:text-ink-primary"
              aria-label="Open chart"
            >
              <Icon name="chart-candle" size={14} />
            </a>
            <IconButton
              onClick={onDelete}
              disabled={pending}
              tone="sell"
              aria-label="Delete signal"
            >
              <Icon name="trash" size={14} />
            </IconButton>
          </div>
        )}
      </div>
      </div>{/* /content wrapper above watermark */}
    </div>
  );
}

function Level({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "buy" | "sell";
}) {
  const cls = {
    neutral: "border-white/5 bg-surface-2/60 text-ink-secondary",
    buy: "border-sig-buy/30 bg-sig-buy/8 text-sig-buy",
    sell: "border-sig-sell/30 bg-sig-sell/8 text-sig-sell",
  }[tone];

  return (
    <div className={`rounded-chip border ${cls} px-2 py-1.5`}>
      <div className="text-[9px] font-semibold uppercase tracking-eyebrow opacity-70">
        {label}
      </div>
      <div className="font-mono text-[12px] font-semibold tabular text-ink-primary">
        {value}
      </div>
    </div>
  );
}

function IconButton({
  children,
  onClick,
  disabled,
  tone,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone: "info" | "sell" }) {
  const cls = {
    info: "border-sig-info/30 bg-sig-info/10 text-sig-info hover:bg-sig-info/20",
    sell: "border-sig-sell/30 bg-sig-sell/10 text-sig-sell hover:bg-sig-sell/20",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-7 w-7 items-center justify-center rounded border transition disabled:opacity-40 ${cls}`}
      {...props}
    >
      {children}
    </button>
  );
}
