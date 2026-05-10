"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSignal, deleteSignals } from "./actions";
import EditLevelsModal from "./EditLevelsModal";

export interface SignalRow {
  id: string;
  signal_id: string;
  created_at: string;
  symbol: string;
  interval: string;
  bias: string | null;
  confidence: number | null;
  risk_level: string | null;
  telegram_sent: boolean;
  outcome: string | null;
  pnl_pct: number | null;
  bars_evaluated: number | null;
  entry_low: number | null;
  entry_high: number | null;
  stop_loss_num: number | null;
  take_profit_1_num: number | null;
  take_profit_2_num: number | null;
  tv_signal: string | null;
  tv_price: number | null;
}

// Column header definitions: short label, full title, Thai description.
// Rendered as a tooltip on hover so the table stays compact.
const COLUMN_INFO: Record<
  string,
  { full: string; desc: string }
> = {
  Time: {
    full: "Created time",
    desc: "เวลาที่ระบบได้รับสัญญาณจาก TradingView (timezone ของ browser)",
  },
  Symbol: {
    full: "Trading symbol",
    desc: "คู่เหรียญที่ส่งสัญญาณ เช่น BTCUSDT, ETHUSDT",
  },
  TF: {
    full: "Timeframe",
    desc: "Timeframe ของแท่งเทียนที่สร้างสัญญาณ (15 = 15m, 60 = 1h, 240 = 4h)",
  },
  Signal: {
    full: "TradingView signal",
    desc: "ทิศทางที่ Pine Script ส่งมา: BUY (long) หรือ SELL (short)",
  },
  Price: {
    full: "Signal price",
    desc: "ราคาตอนแท่งเทียนปิด ที่ Pine Script เห็นและส่งสัญญาณ",
  },
  "AI Bias": {
    full: "AI bias",
    desc: "ทิศทางที่ AI วิเคราะห์ — LONG, SHORT, หรือ WAIT (ข้ามไม่ยุ่ง)",
  },
  "Conf.": {
    full: "Confidence (%)",
    desc: "ระดับความมั่นใจของ AI กับการตัดสินใจ (0–100%) — สูงกว่า 70% = มั่นใจมาก",
  },
  Risk: {
    full: "Risk level",
    desc: "ระดับความเสี่ยงของ setup นี้ตาม AI: Low / Medium / High",
  },
  Entry: {
    full: "Entry price (mid)",
    desc: "ราคากลางของ entry zone — คำนวณจาก (entry_low + entry_high) / 2",
  },
  SL: {
    full: "Stop Loss",
    desc: "ราคา cut loss — ถ้าราคาแตะจุดนี้ก่อนถึง TP จะนับเป็น LOSS_SL",
  },
  TP1: {
    full: "Take Profit 1",
    desc: "เป้าหมายแรก — ถ้าราคาแตะก่อน SL จะนับเป็น WIN_TP1",
  },
  TP2: {
    full: "Take Profit 2",
    desc: "เป้าหมายที่สอง (ไกลกว่า TP1) — ถ้าแตะก่อน SL จะนับเป็น WIN_TP2",
  },
  "R:R": {
    full: "Risk : Reward ratio",
    desc: "อัตราส่วนผลตอบแทนต่อความเสี่ยง (TP1) — สูงกว่า 1.5:1 = setup ที่คุ้มเสี่ยง",
  },
  Outcome: {
    full: "Backtest outcome",
    desc: "ผลจาก Binance klines: PENDING / OPEN / WIN_TP1 / WIN_TP2 / LOSS_SL / SKIP_WAIT / NO_DATA",
  },
  PnL: {
    full: "Profit / Loss (%)",
    desc: "กำไรหรือขาดทุนเป็น % จากราคา entry ถึงราคา outcome",
  },
  TG: {
    full: "Telegram sent",
    desc: "✓ = ส่งข้อความเข้า Telegram สำเร็จ, ✗ = ล้มเหลว",
  },
  Actions: {
    full: "Actions",
    desc: "✏️ แก้ไข SL/TP levels (จะ reset outcome เป็น PENDING) · 🗑 ลบ signal ถาวร",
  },
};

function ColHeader({
  label,
  className = "",
  align = "left",
}: {
  label: string;
  className?: string;
  align?: "left" | "right";
}) {
  const info = COLUMN_INFO[label];
  return (
    <th
      className={`group relative px-4 py-3 ${align === "right" ? "text-right" : ""} ${className}`}
      title={info ? `${info.full} — ${info.desc}` : label}
    >
      <span className="cursor-help border-b border-dotted border-slate-600/60">
        {label}
      </span>
      {info && (
        <div
          className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-64 rounded-md border border-slate-700 bg-slate-900/95 p-3 text-left text-[11px] font-normal normal-case tracking-normal text-slate-200 shadow-lg group-hover:block"
          role="tooltip"
        >
          <div className="mb-1 font-semibold text-slate-100">{info.full}</div>
          <div className="text-slate-400">{info.desc}</div>
        </div>
      )}
    </th>
  );
}

function entryMid(r: SignalRow): number | null {
  if (r.entry_low !== null && r.entry_high !== null) {
    return (r.entry_low + r.entry_high) / 2;
  }
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

function biasBadge(bias: string | null) {
  const base = "rounded px-2 py-0.5 text-xs font-bold";
  switch (bias) {
    case "LONG":
      return `${base} bg-emerald-500/20 text-emerald-300 border border-emerald-500/40`;
    case "SHORT":
      return `${base} bg-rose-500/20 text-rose-300 border border-rose-500/40`;
    case "WAIT":
      return `${base} bg-amber-500/20 text-amber-300 border border-amber-500/40`;
    default:
      return `${base} bg-slate-500/20 text-slate-300 border border-slate-500/40`;
  }
}

function riskBadge(risk: string | null) {
  const base = "rounded px-2 py-0.5 text-xs font-semibold";
  switch (risk) {
    case "Low":
      return `${base} bg-emerald-500/15 text-emerald-300`;
    case "Medium":
      return `${base} bg-amber-500/15 text-amber-300`;
    case "High":
      return `${base} bg-rose-500/15 text-rose-300`;
    default:
      return `${base} bg-slate-500/15 text-slate-300`;
  }
}

function signalBadge(signal: string) {
  const base = "rounded px-2 py-0.5 text-xs font-semibold uppercase";
  const s = signal.toUpperCase();
  if (s.includes("BUY") || s.includes("LONG"))
    return `${base} bg-emerald-500/20 text-emerald-300`;
  if (s.includes("SELL") || s.includes("SHORT"))
    return `${base} bg-rose-500/20 text-rose-300`;
  return `${base} bg-slate-500/20 text-slate-300`;
}

function outcomeBadge(o: string | null) {
  const base = "rounded px-2 py-0.5 text-xs font-bold whitespace-nowrap";
  switch (o) {
    case "WIN_TP1":
      return `${base} bg-emerald-500/25 text-emerald-200 border border-emerald-500/40`;
    case "WIN_TP2":
      return `${base} bg-emerald-500/40 text-emerald-100 border border-emerald-500/60`;
    case "LOSS_SL":
      return `${base} bg-rose-500/25 text-rose-200 border border-rose-500/40`;
    case "OPEN":
      return `${base} bg-sky-500/20 text-sky-300 border border-sky-500/40`;
    case "PENDING":
      return `${base} bg-slate-500/20 text-slate-300 border border-slate-500/40`;
    case "SKIP_WAIT":
      return `${base} bg-amber-500/15 text-amber-300 border border-amber-500/40`;
    case "NO_DATA":
    case "ERROR":
      return `${base} bg-zinc-500/20 text-zinc-300 border border-zinc-500/40`;
    default:
      return `${base} bg-slate-500/20 text-slate-300`;
  }
}

function outcomeLabel(o: string | null): string {
  if (!o) return "-";
  if (o === "WIN_TP1") return "✅ TP1";
  if (o === "WIN_TP2") return "✅✅ TP2";
  if (o === "LOSS_SL") return "❌ SL";
  if (o === "OPEN") return "⏳ OPEN";
  if (o === "PENDING") return "🕒 Pending";
  if (o === "SKIP_WAIT") return "⏭ Wait";
  if (o === "NO_DATA") return "—";
  return o;
}

function fmtPrice(v: number | null) {
  if (v === null || v === undefined) return "-";
  return v.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { hour12: false });
}

function fmtPnl(p: number | null) {
  if (p === null || p === undefined) return "-";
  const sign = p >= 0 ? "+" : "";
  return `${sign}${p.toFixed(2)}%`;
}

export default function SignalsTable({ rows }: { rows: SignalRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<SignalRow | null>(null);

  const allIds = useMemo(() => rows.map((r) => r.signal_id), [rows]);
  const allSelected = selected.size > 0 && selected.size === allIds.length;
  const someSelected = selected.size > 0 && !allSelected;

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) =>
      prev.size === allIds.length ? new Set() : new Set(allIds)
    );
  };

  const onDeleteOne = (id: string, label: string) => {
    if (!confirm(`ลบ signal ${label} ออกถาวร?`)) return;
    setErr(null);
    startTransition(async () => {
      const res = await deleteSignal(id);
      if (!res.ok) setErr(res.error ?? "failed");
      else router.refresh();
    });
  };

  const onDeleteSelected = () => {
    if (selected.size === 0) return;
    if (!confirm(`ลบ ${selected.size} รายการที่เลือกออกถาวร?`)) return;
    setErr(null);
    const ids = Array.from(selected);
    startTransition(async () => {
      const res = await deleteSignals(ids);
      if (!res.ok) {
        setErr(res.error ?? "failed");
        return;
      }
      setSelected(new Set());
      router.refresh();
    });
  };

  return (
    <div className="overflow-hidden rounded-xl border border-crypto-border bg-crypto-panel shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-crypto-border bg-black/20 px-4 py-2 text-sm">
        <div className="text-slate-400">
          {selected.size > 0 ? (
            <span>
              เลือก <span className="font-semibold text-slate-200">{selected.size}</span> รายการ
            </span>
          ) : (
            <span>เลือกหลายรายการเพื่อลบพร้อมกัน</span>
          )}
          {err ? <span className="ml-3 text-rose-400">· {err}</span> : null}
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              disabled={pending}
              className="rounded border border-slate-500/40 bg-slate-500/10 px-3 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-500/20 disabled:opacity-40"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={onDeleteSelected}
            disabled={pending || selected.size === 0}
            className="rounded border border-rose-500/40 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? "Deleting…" : `🗑 Delete selected${selected.size ? ` (${selected.size})` : ""}`}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-crypto-border text-sm">
          <thead className="bg-black/30 text-left text-xs uppercase tracking-wider text-slate-400">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={toggleAll}
                  className="h-4 w-4 cursor-pointer accent-rose-500"
                  aria-label="Select all"
                />
              </th>
              <ColHeader label="Time" />
              <ColHeader label="Symbol" />
              <ColHeader label="TF" />
              <ColHeader label="Signal" />
              <ColHeader label="Price" />
              <ColHeader label="AI Bias" />
              <ColHeader label="Conf." />
              <ColHeader label="Risk" />
              <ColHeader label="Entry" />
              <ColHeader label="SL" className="text-rose-300/70" />
              <ColHeader label="TP1" className="text-emerald-300/70" />
              <ColHeader label="TP2" className="text-emerald-300/70" />
              <ColHeader label="R:R" />
              <ColHeader label="Outcome" />
              <ColHeader label="PnL" />
              <ColHeader label="TG" />
              <ColHeader label="Actions" align="right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-crypto-border">
            {rows.length === 0 && (
              <tr>
                <td colSpan={18} className="px-4 py-12 text-center text-slate-500">
                  No signals yet. Send a test webhook to{" "}
                  <code className="text-emerald-300">/api/webhook/tradingview</code>.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const isSel = selected.has(r.signal_id);
              return (
                <tr
                  key={r.id}
                  className={`hover:bg-black/20 ${isSel ? "bg-rose-500/5" : ""}`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => toggleOne(r.signal_id)}
                      className="h-4 w-4 cursor-pointer accent-rose-500"
                      aria-label={`Select row ${r.symbol} ${fmtTime(r.created_at)}`}
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-300">
                    {fmtTime(r.created_at)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-100">
                    {r.symbol}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-400">
                    {r.interval}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={signalBadge(r.tv_signal ?? "-")}>
                      {r.tv_signal ?? "-"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-200">
                    {fmtPrice(r.tv_price)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={biasBadge(r.bias)}>{r.bias ?? "-"}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-200">
                    {r.confidence ?? "-"}
                    {r.confidence !== null ? "%" : ""}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={riskBadge(r.risk_level)}>{r.risk_level ?? "-"}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-300">
                    {fmtPrice(entryMid(r))}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-rose-300/90">
                    {fmtPrice(r.stop_loss_num)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-emerald-300/90">
                    {fmtPrice(r.take_profit_1_num)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-emerald-300/90">
                    {fmtPrice(r.take_profit_2_num)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-300">
                    {rrRatio(r) === null ? "-" : `${rrRatio(r)?.toFixed(2)}:1`}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={outcomeBadge(r.outcome)}>
                      {outcomeLabel(r.outcome)}
                    </span>
                    {r.bars_evaluated ? (
                      <span className="ml-2 text-[10px] text-slate-500">
                        {r.bars_evaluated} bars
                      </span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                    <span
                      className={
                        r.pnl_pct === null
                          ? "text-slate-500"
                          : r.pnl_pct >= 0
                          ? "text-emerald-400"
                          : "text-rose-400"
                      }
                    >
                      {fmtPnl(r.pnl_pct)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {r.telegram_sent ? (
                      <span className="text-emerald-400">✓</span>
                    ) : (
                      <span className="text-rose-400">✗</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <button
                        type="button"
                        onClick={() => setEditing(r)}
                        disabled={pending}
                        className="rounded border border-sky-500/40 bg-sky-500/10 px-2 py-1 text-xs font-semibold text-sky-300 hover:bg-sky-500/20 disabled:opacity-40"
                        title="Edit SL/TP levels"
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onDeleteOne(r.signal_id, `${r.symbol} ${fmtTime(r.created_at)}`)
                        }
                        disabled={pending}
                        className="rounded border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 disabled:opacity-40"
                        title="Delete signal permanently"
                      >
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <EditLevelsModal
        open={editing !== null}
        onClose={() => setEditing(null)}
        initial={
          editing
            ? {
                analysisId: editing.id,
                symbol: editing.symbol,
                bias: editing.bias,
                entry_low: editing.entry_low,
                entry_high: editing.entry_high,
                stop_loss_num: editing.stop_loss_num,
                take_profit_1_num: editing.take_profit_1_num,
                take_profit_2_num: editing.take_profit_2_num,
              }
            : null
        }
      />
    </div>
  );
}
