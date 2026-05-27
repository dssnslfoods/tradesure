"use client";

import { useState } from "react";
import type { TradingPlanDef } from "@/types/signal";

interface StatRow {
  confidence: number | null;
  outcome: string | null;
  signal_type: string | null;
  bias: string | null;
}

export interface ConfidenceStatsInput {
  rows: StatRow[];
  plansCatalog: TradingPlanDef[];
}

// Bucket definition — order matters (top → bottom in display)
const BUCKETS = [
  { key: "ge80",   label: "≥ 80%",    min: 80,  max: 101, emoji: "🔥" },
  { key: "70-79",  label: "70–79%",   min: 70,  max: 80,  emoji: "✅" },
  { key: "60-69",  label: "60–69%",   min: 60,  max: 70,  emoji: "👌" },
  { key: "50-59",  label: "50–59%",   min: 50,  max: 60,  emoji: "🐢" },
  { key: "lt50",   label: "< 50%",    min: 0,   max: 50,  emoji: "🐌" },
];

const WIN_OUTCOMES = new Set(["WIN_TP1", "WIN_TP2"]);
const LOSS_OUTCOMES = new Set(["LOSS_SL"]);

interface Cell {
  total: number;   // all decided rows in this bucket × plan
  wins: number;
  losses: number;
  open: number;
  winRate: number | null;
}

function bucketize(rows: StatRow[]): Map<string, Map<string, Cell>> {
  // Map<bucket_key, Map<plan_key, Cell>>
  const out = new Map<string, Map<string, Cell>>();
  for (const b of BUCKETS) out.set(b.key, new Map());

  for (const r of rows) {
    if (r.bias !== "LONG" && r.bias !== "SHORT") continue;
    const conf = typeof r.confidence === "number" ? r.confidence : null;
    if (conf === null) continue;

    const bucket = BUCKETS.find((b) => conf >= b.min && conf < b.max);
    if (!bucket) continue;

    const plan = r.signal_type ?? "swing";
    const inner = out.get(bucket.key)!;
    const cell = inner.get(plan) ?? { total: 0, wins: 0, losses: 0, open: 0, winRate: null };

    if (WIN_OUTCOMES.has(r.outcome ?? "")) {
      cell.wins += 1;
      cell.total += 1;
    } else if (LOSS_OUTCOMES.has(r.outcome ?? "")) {
      cell.losses += 1;
      cell.total += 1;
    } else if (r.outcome === "OPEN" || r.outcome === "PENDING") {
      cell.open += 1;
    }
    // skipped/expired/no_data: not counted in win/loss/open

    if (cell.wins + cell.losses > 0) {
      cell.winRate = (cell.wins / (cell.wins + cell.losses)) * 100;
    }
    inner.set(plan, cell);
  }
  return out;
}

function planMeta(key: string, catalog: TradingPlanDef[]): { emoji: string; label: string } {
  const def = catalog.find((p) => p.key === key);
  if (def) return { emoji: def.emoji, label: def.label };
  if (key === "swing") return { emoji: "🔵", label: "Swing" };
  if (key === "intraday") return { emoji: "🟣", label: "Intraday" };
  return { emoji: "⚪", label: key };
}

function aggregate(cells: Cell[]): Cell {
  const out: Cell = { total: 0, wins: 0, losses: 0, open: 0, winRate: null };
  for (const c of cells) {
    out.total += c.total;
    out.wins += c.wins;
    out.losses += c.losses;
    out.open += c.open;
  }
  const decided = out.wins + out.losses;
  if (decided > 0) out.winRate = (out.wins / decided) * 100;
  return out;
}

function winRateColor(wr: number | null, decided: number): string {
  if (wr === null || decided < 3) return "text-ink-muted"; // not enough data
  if (wr >= 60) return "text-sig-buy";
  if (wr >= 45) return "text-ink-primary";
  return "text-sig-sell";
}

export default function ConfidenceStatsTable({ rows, plansCatalog }: ConfidenceStatsInput) {
  const [open, setOpen] = useState(true);

  // Build plan list — only plans that have at least 1 decided trade
  const stats = bucketize(rows);
  const plansSeen = new Set<string>();
  // Track every plan that appears in the data (any outcome), and also any
  // plan defined in the catalog — so the table shows a column for each plan
  // even before it has closed trades. Order by catalog order, then any
  // extra (legacy / not-in-catalog) keys appended.
  stats.forEach((inner) => {
    inner.forEach((_cell, plan) => plansSeen.add(plan));
  });
  rows.forEach((r) => plansSeen.add(r.signal_type ?? "swing"));
  const catalogOrder = plansCatalog.map((p) => p.key);
  const planList = [
    ...catalogOrder.filter((k) => plansCatalog.length > 0),
    ...Array.from(plansSeen).filter((k) => !catalogOrder.includes(k)).sort(),
  ];

  // Overall row (all plans combined per bucket)
  const overallByBucket = new Map<string, Cell>();
  BUCKETS.forEach((b) => {
    const inner = stats.get(b.key);
    if (!inner) return;
    overallByBucket.set(b.key, aggregate(Array.from(inner.values())));
  });

  // Bottom row: per-plan totals (all buckets combined)
  const planTotals = new Map<string, Cell>();
  planList.forEach((plan) => {
    const cells: Cell[] = [];
    stats.forEach((inner) => {
      const c = inner.get(plan);
      if (c) cells.push(c);
    });
    planTotals.set(plan, aggregate(cells));
  });
  const grandTotal = aggregate(Array.from(planTotals.values()));

  // "Has data" = at least one decided trade somewhere. The table still
  // renders all plan columns even at 0 decided, but we show the empty-state
  // hint when nothing has resolved yet.
  const hasData = grandTotal.wins + grandTotal.losses > 0;

  return (
    <div className="card mb-5 overflow-hidden p-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-white/[0.02]"
      >
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold uppercase tracking-eyebrow text-ink-secondary">
              📊 Performance by confidence × plan
            </span>
            {!open && hasData && (
              <span className="chip chip-mute !text-[10px]">
                {grandTotal.wins}W / {grandTotal.losses}L · {grandTotal.winRate !== null ? `${grandTotal.winRate.toFixed(1)}% WR` : "—"}
              </span>
            )}
          </div>
          <p className="mt-1 max-w-2xl text-[11px] text-ink-muted">
            Win rate ตาม bucket ความมั่นใจ × แผนเทรด — ใช้เทียบ "ถ้าเข้าเฉพาะ confidence ≥ X% จะกินกี่ %"
          </p>
        </div>
        <span className="text-ink-muted">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-white/5 px-5 pb-5 pt-3">
          {!hasData ? (
            <div className="rounded-chip border border-white/5 bg-surface-2/40 px-4 py-6 text-center text-[12px] text-ink-muted">
              ยังไม่มี trade ที่ปิด (WIN/LOSS) ในข้อมูลล่าสุด 500 รายการ — รอ signal แรกผ่าน backtest
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-[12px]">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] uppercase tracking-eyebrow text-ink-muted">
                    <th className="px-2 py-2 text-left font-semibold">Confidence</th>
                    <th className="px-2 py-2 text-right font-semibold">All</th>
                    {planList.map((p) => {
                      const meta = planMeta(p, plansCatalog);
                      return (
                        <th key={p} className="px-2 py-2 text-right font-semibold">
                          {meta.emoji} {meta.label}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {BUCKETS.map((b) => {
                    const overall = overallByBucket.get(b.key) ?? { total: 0, wins: 0, losses: 0, open: 0, winRate: null };
                    return (
                      <tr key={b.key} className="border-b border-white/5">
                        <td className="px-2 py-2.5 text-ink-primary">
                          <span className="mr-1">{b.emoji}</span>
                          {b.label}
                        </td>
                        <td className="px-2 py-2.5 text-right font-mono">
                          <BucketCell cell={overall} />
                        </td>
                        {planList.map((p) => {
                          const c = stats.get(b.key)?.get(p) ?? { total: 0, wins: 0, losses: 0, open: 0, winRate: null };
                          return (
                            <td key={p} className="px-2 py-2.5 text-right font-mono">
                              <BucketCell cell={c} />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  {/* Total row */}
                  <tr className="bg-surface-2/40">
                    <td className="px-2 py-2.5 text-[11px] font-semibold uppercase tracking-eyebrow text-ink-secondary">
                      Total
                    </td>
                    <td className="px-2 py-2.5 text-right font-mono">
                      <BucketCell cell={grandTotal} bold />
                    </td>
                    {planList.map((p) => {
                      const t = planTotals.get(p) ?? { total: 0, wins: 0, losses: 0, open: 0, winRate: null };
                      return (
                        <td key={p} className="px-2 py-2.5 text-right font-mono">
                          <BucketCell cell={t} bold />
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
              <p className="mt-3 text-[10px] text-ink-faint">
                อ่านค่า: <span className="font-mono">WR% (n)</span> โดย n = จำนวนเทรดที่ปิดแล้ว (wins + losses).
                สีจางเมื่อ n &lt; 3 (sample ยังเล็กเกินไป).
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BucketCell({ cell, bold }: { cell: Cell; bold?: boolean }) {
  const decided = cell.wins + cell.losses;
  if (decided === 0) {
    return <span className="text-ink-faint">—</span>;
  }
  const wrColor = winRateColor(cell.winRate, decided);
  const wrText = cell.winRate !== null ? `${cell.winRate.toFixed(0)}%` : "—";
  return (
    <span className={`${wrColor} ${bold ? "font-semibold" : ""}`}>
      {wrText} <span className="text-ink-faint">({decided})</span>
    </span>
  );
}
