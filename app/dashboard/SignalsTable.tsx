"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSignals } from "./actions";
import EditLevelsModal from "./EditLevelsModal";
import TradeCard from "./TradeCard";
import Icon from "@/components/ui/Icon";

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

type FilterKey = "all" | "open" | "wins" | "losses" | "skip";

const FILTERS: { key: FilterKey; label: string; match: (r: SignalRow) => boolean }[] = [
  { key: "all", label: "All", match: () => true },
  { key: "open", label: "Open", match: (r) => r.outcome === "OPEN" || r.outcome === "PENDING" },
  { key: "wins", label: "Wins", match: (r) => r.outcome === "WIN_TP1" || r.outcome === "WIN_TP2" },
  { key: "losses", label: "Losses", match: (r) => r.outcome === "LOSS_SL" },
  { key: "skip", label: "No Trade", match: (r) => r.outcome === "SKIP_WAIT" },
];

export default function SignalsTable({
  rows,
  isAdmin = false,
}: {
  rows: SignalRow[];
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<SignalRow | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filterMatch = FILTERS.find((f) => f.key === filter)!;
  const visible = rows.filter((r) => filterMatch.match(r));

  const counts: Record<FilterKey, number> = {
    all: rows.length,
    open: rows.filter((r) => r.outcome === "OPEN" || r.outcome === "PENDING").length,
    wins: rows.filter((r) => r.outcome === "WIN_TP1" || r.outcome === "WIN_TP2").length,
    losses: rows.filter((r) => r.outcome === "LOSS_SL").length,
    skip: rows.filter((r) => r.outcome === "SKIP_WAIT").length,
  };

  // Mark "new" signals as those created in last hour
  const oneHourAgo = Date.now() - 60 * 60 * 1000;

  const onBulkDelete = () => {
    if (selected.size === 0) return;
    if (!confirm(`ลบ ${selected.size} รายการที่เลือกออกถาวร?`)) return;
    start(async () => {
      const res = await deleteSignals(Array.from(selected));
      if (res.ok) {
        setSelected(new Set());
        router.refresh();
      } else alert(res.error ?? "failed");
    });
  };

  return (
    <div>
      {/* Filter toolbar */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`chip transition ${
              filter === f.key
                ? "!bg-brand/15 !text-brand !border-brand/40"
                : "hover:!bg-surface-2 hover:!text-ink-primary"
            }`}
          >
            {f.label}
            <span className="ml-1 rounded bg-black/30 px-1.5 py-0.5 text-[9px] font-bold text-ink-muted">
              {counts[f.key]}
            </span>
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-white/5" />
        <span className="text-[11px] text-ink-muted">
          แสดง {visible.length} จาก {rows.length} รายการ
        </span>
        {isAdmin && selected.size > 0 && (
          <button
            type="button"
            onClick={onBulkDelete}
            disabled={pending}
            className="ml-auto chip !bg-sig-sell/10 !text-sig-sell !border-sig-sell/30 hover:!bg-sig-sell/20"
          >
            <Icon name="trash" size={12} />
            Delete selected ({selected.size})
          </button>
        )}
      </div>

      {/* Card grid */}
      {visible.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-ink-muted">
            <Icon name="wave" size={22} />
          </span>
          <div className="text-[15px] font-semibold text-ink-secondary">ไม่มี signal ในตัวกรองนี้</div>
          <div className="mt-1 text-[12px] text-ink-muted">
            ลองเลือกตัวกรองอื่นหรือรอ signal ใหม่จาก TradingView
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((r) => {
            const isNew = new Date(r.created_at).getTime() > oneHourAgo;
            return (
              <div key={r.id} className="relative">
                {isAdmin && (
                  <input
                    type="checkbox"
                    checked={selected.has(r.signal_id)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(r.signal_id);
                      else next.delete(r.signal_id);
                      setSelected(next);
                    }}
                    className="absolute right-3 top-3 z-10 h-4 w-4 cursor-pointer accent-brand"
                    aria-label={`Select ${r.symbol}`}
                  />
                )}
                <TradeCard
                  row={r}
                  isAdmin={isAdmin}
                  onEdit={() => setEditing(r)}
                  isNew={isNew}
                />
              </div>
            );
          })}
        </div>
      )}

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
