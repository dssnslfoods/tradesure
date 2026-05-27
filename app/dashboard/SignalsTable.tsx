"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSignals } from "./actions";
import EditLevelsModal from "./EditLevelsModal";
import TradeCard from "./TradeCard";
import Icon from "@/components/ui/Icon";

const PAGE_SIZE = 10;

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
  signal_type: string | null;
}

import type { TradingPlanDef } from "@/types/signal";

type FilterKey = "all" | "open" | "wins" | "losses" | "skip" | "queued";

// All three SKIP_* outcomes mean "we didn't take this trade" — group under one filter.
const isSkipped = (r: SignalRow) =>
  r.outcome === "SKIP_WAIT" ||
  r.outcome === "SKIP_LOW_CONF" ||
  r.outcome === "SKIP_HOUR";

const FILTERS: { key: FilterKey; label: string; match: (r: SignalRow) => boolean }[] = [
  { key: "all", label: "All", match: () => true },
  { key: "open", label: "Open", match: (r) => r.outcome === "OPEN" || r.outcome === "PENDING" },
  { key: "queued", label: "Queued", match: (r) => r.outcome === "QUEUED" },
  { key: "wins", label: "Wins", match: (r) => r.outcome === "WIN_TP1" || r.outcome === "WIN_TP2" },
  { key: "losses", label: "Losses", match: (r) => r.outcome === "LOSS_SL" },
  { key: "skip", label: "No Trade", match: isSkipped },
];

export default function SignalsTable({
  rows,
  isAdmin = false,
  plansCatalog = [],
}: {
  rows: SignalRow[];
  isAdmin?: boolean;
  plansCatalog?: TradingPlanDef[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<SignalRow | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [symbolFilter, setSymbolFilter] = useState<string>("all");
  const [planFilter, setPlanFilter] = useState<string>("all");

  // Helper: resolve a row's plan to its display metadata. Falls back to a
  // generic "Swing" if no catalog entry matches (legacy data, custom keys
  // not yet added to catalog).
  const planMeta = (key: string) => {
    const def = plansCatalog.find((p) => p.key === key);
    if (def) return { emoji: def.emoji, label: def.label };
    if (key === "swing") return { emoji: "🔵", label: "Swing · 1H" };
    if (key === "intraday") return { emoji: "🟣", label: "Intraday · 15m" };
    return { emoji: "⚪", label: key };
  };
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);

  // Plans to show as filter chips: every plan in the catalog (so the row is
  // complete even when a plan has no recent signals), plus any data-only
  // plan keys not in the catalog (legacy). Ordered by catalog order.
  const uniquePlans = useMemo(() => {
    const dataPlans = new Set<string>();
    for (const r of rows) dataPlans.add(r.signal_type ?? "swing");
    const catalogOrder = plansCatalog.map((p) => p.key);
    const extra = Array.from(dataPlans)
      .filter((k) => !catalogOrder.includes(k))
      .sort();
    return [...catalogOrder, ...extra];
  }, [rows, plansCatalog]);

  // Unique symbols across all rows — sorted alphabetically so the filter is
  // stable as new symbols come in. We only render the symbol selector when
  // there are 2+, otherwise the row is noise for single-symbol users.
  const uniqueSymbols = useMemo(() => {
    return Array.from(new Set(rows.map((r) => r.symbol))).sort();
  }, [rows]);

  const filterMatch = FILTERS.find((f) => f.key === filter)!;
  // Apply ALL THREE filters — outcome (chips), symbol, and trading plan.
  const planMatches = (r: SignalRow) =>
    planFilter === "all" || (r.signal_type ?? "swing") === planFilter;
  const visible = useMemo(
    () =>
      rows.filter(
        (r) =>
          filterMatch.match(r) &&
          (symbolFilter === "all" || r.symbol === symbolFilter) &&
          planMatches(r)
      ),
    [rows, filterMatch, symbolFilter, planFilter]
  );

  // Pagination
  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageStart = currentPage * PAGE_SIZE;
  const pageEnd = pageStart + PAGE_SIZE;
  const pageItems = visible.slice(pageStart, pageEnd);

  // Reset to first page when any filter changes
  useEffect(() => {
    setPage(0);
  }, [filter, symbolFilter, planFilter]);

  // Outcome chip counts reflect the CURRENT symbol filter so the numbers
  // beside each chip match what the user would see after clicking it.
  const symbolFiltered = useMemo(
    () => (symbolFilter === "all" ? rows : rows.filter((r) => r.symbol === symbolFilter)),
    [rows, symbolFilter]
  );
  const counts: Record<FilterKey, number> = {
    all: symbolFiltered.length,
    open: symbolFiltered.filter((r) => r.outcome === "OPEN" || r.outcome === "PENDING").length,
    queued: symbolFiltered.filter((r) => r.outcome === "QUEUED").length,
    wins: symbolFiltered.filter((r) => r.outcome === "WIN_TP1" || r.outcome === "WIN_TP2").length,
    losses: symbolFiltered.filter((r) => r.outcome === "LOSS_SL").length,
    skip: symbolFiltered.filter(isSkipped).length,
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
      {/* Trading-plan filter — only shown when both plans have data */}
      {uniquePlans.length >= 2 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 overflow-x-auto pb-1">
          <span className="text-[11px] uppercase tracking-eyebrow text-ink-muted">
            แผนเทรด:
          </span>
          <button
            type="button"
            onClick={() => setPlanFilter("all")}
            className={`chip !text-[11px] transition ${
              planFilter === "all"
                ? "!bg-brand/15 !text-brand !border-brand/40"
                : "hover:!bg-surface-2 hover:!text-ink-primary"
            }`}
          >
            ทั้งหมด
            <span className="ml-1 rounded bg-black/30 px-1.5 py-0.5 text-[9px] font-bold text-ink-muted">
              {rows.length}
            </span>
          </button>
          {uniquePlans.map((p) => {
            const planRows = rows.filter((r) => (r.signal_type ?? "swing") === p);
            const planWins = planRows.filter(
              (r) => r.outcome === "WIN_TP1" || r.outcome === "WIN_TP2"
            ).length;
            const planLosses = planRows.filter((r) => r.outcome === "LOSS_SL").length;
            const decided = planWins + planLosses;
            const planWinRate = decided > 0 ? Math.round((planWins / decided) * 100) : null;
            const meta = planMeta(p);
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPlanFilter(p)}
                className={`chip !text-[11px] transition ${
                  planFilter === p
                    ? "!bg-brand/15 !text-brand !border-brand/40"
                    : "hover:!bg-surface-2 hover:!text-ink-primary"
                }`}
                title={
                  planWinRate !== null
                    ? `${planWins}W / ${planLosses}L · ${planWinRate}% win rate`
                    : `${planRows.length} signals`
                }
              >
                {meta.emoji} {meta.label}
                <span className="ml-1 rounded bg-black/30 px-1.5 py-0.5 text-[9px] font-bold text-ink-muted">
                  {planRows.length}
                </span>
                {planWinRate !== null && (
                  <span
                    className={`ml-1 text-[9px] font-bold ${
                      planWinRate >= 50 ? "text-sig-buy" : "text-sig-sell"
                    }`}
                  >
                    {planWinRate}%
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Symbol filter — only shown when 2+ unique symbols are tracked */}
      {uniqueSymbols.length >= 2 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 overflow-x-auto pb-1">
          <span className="text-[11px] uppercase tracking-eyebrow text-ink-muted">
            เหรียญ:
          </span>
          <button
            type="button"
            onClick={() => setSymbolFilter("all")}
            className={`chip !text-[11px] transition ${
              symbolFilter === "all"
                ? "!bg-brand/15 !text-brand !border-brand/40"
                : "hover:!bg-surface-2 hover:!text-ink-primary"
            }`}
          >
            ทั้งหมด
            <span className="ml-1 rounded bg-black/30 px-1.5 py-0.5 text-[9px] font-bold text-ink-muted">
              {rows.length}
            </span>
          </button>
          {uniqueSymbols.map((sym) => {
            const symCount = rows.filter((r) => r.symbol === sym).length;
            const symWins = rows.filter(
              (r) => r.symbol === sym && (r.outcome === "WIN_TP1" || r.outcome === "WIN_TP2")
            ).length;
            const symLosses = rows.filter((r) => r.symbol === sym && r.outcome === "LOSS_SL").length;
            const decided = symWins + symLosses;
            const symWinRate = decided > 0 ? Math.round((symWins / decided) * 100) : null;
            return (
              <button
                key={sym}
                type="button"
                onClick={() => setSymbolFilter(sym)}
                className={`chip !text-[11px] transition ${
                  symbolFilter === sym
                    ? "!bg-brand/15 !text-brand !border-brand/40"
                    : "hover:!bg-surface-2 hover:!text-ink-primary"
                }`}
                title={
                  symWinRate !== null
                    ? `${symWins}W / ${symLosses}L · ${symWinRate}% win rate`
                    : `${symCount} signals`
                }
              >
                {sym}
                <span className="ml-1 rounded bg-black/30 px-1.5 py-0.5 text-[9px] font-bold text-ink-muted">
                  {symCount}
                </span>
                {symWinRate !== null && (
                  <span
                    className={`ml-1 text-[9px] font-bold ${
                      symWinRate >= 50 ? "text-sig-buy" : "text-sig-sell"
                    }`}
                  >
                    {symWinRate}%
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Outcome filter toolbar */}
      <div className="mb-5 flex flex-wrap items-center gap-2 overflow-x-auto pb-1">
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
          แสดง{" "}
          <span className="font-mono text-ink-primary">
            {visible.length === 0 ? 0 : pageStart + 1}-{Math.min(pageEnd, visible.length)}
          </span>{" "}
          จาก {visible.length} รายการ
        </span>
        {isAdmin && selected.size > 0 && (
          <button
            type="button"
            onClick={onBulkDelete}
            disabled={pending}
            className="chip !bg-sig-sell/10 !text-sig-sell !border-sig-sell/30 hover:!bg-sig-sell/20 sm:ml-auto"
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
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pageItems.map((r) => {
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
                    planMeta={planMeta(r.signal_type ?? "swing")}
                  />
                </div>
              );
            })}
          </div>

          {/* Pagination controls */}
          {totalPages > 1 && (
            <Pagination
              page={currentPage}
              totalPages={totalPages}
              onPage={(p) => {
                setPage(p);
                // Scroll back to top of list smoothly
                if (typeof window !== "undefined") {
                  window.scrollTo({ top: window.scrollY - 200, behavior: "smooth" });
                }
              }}
            />
          )}
        </>
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

function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  // Build page-number list with ellipses for compactness:
  //   [1] 2 3 … (last) when page is near start
  //   1 … (page-1) [page] (page+1) … last when in middle
  //   1 … (last-2) (last-1) [last] when near end
  const range: (number | "ellipsis")[] = [];
  const push = (v: number | "ellipsis") => {
    if (typeof v === "number" && (v < 0 || v >= totalPages)) return;
    if (range[range.length - 1] === v && v === "ellipsis") return;
    range.push(v);
  };

  if (totalPages <= 7) {
    for (let i = 0; i < totalPages; i++) push(i);
  } else {
    push(0);
    if (page > 2) push("ellipsis");
    for (let i = page - 1; i <= page + 1; i++) {
      if (i > 0 && i < totalPages - 1) push(i);
    }
    if (page < totalPages - 3) push("ellipsis");
    push(totalPages - 1);
  }

  return (
    <nav
      className="mt-5 flex flex-wrap items-center justify-center gap-1"
      aria-label="Pagination"
    >
      <button
        type="button"
        onClick={() => onPage(page - 1)}
        disabled={page === 0}
        className="flex h-8 items-center gap-1 rounded-chip border border-white/5 bg-surface-1 px-3 text-[12px] text-ink-secondary transition hover:bg-surface-2 hover:text-ink-primary disabled:cursor-not-allowed disabled:opacity-30"
        aria-label="Previous page"
      >
        <Icon name="chevron-right" size={14} className="rotate-180" />
        Prev
      </button>

      <div className="mx-1 flex items-center gap-1">
        {range.map((v, i) =>
          v === "ellipsis" ? (
            <span
              key={`e${i}`}
              className="px-2 font-mono text-[12px] text-ink-faint"
              aria-hidden="true"
            >
              …
            </span>
          ) : (
            <button
              key={v}
              type="button"
              onClick={() => onPage(v)}
              aria-current={v === page ? "page" : undefined}
              className={`flex h-8 min-w-[32px] items-center justify-center rounded-chip px-2 font-mono text-[12px] transition ${
                v === page
                  ? "bg-brand/15 text-brand shadow-glow ring-1 ring-brand/30"
                  : "border border-white/5 bg-surface-1 text-ink-secondary hover:bg-surface-2 hover:text-ink-primary"
              }`}
            >
              {v + 1}
            </button>
          )
        )}
      </div>

      <button
        type="button"
        onClick={() => onPage(page + 1)}
        disabled={page >= totalPages - 1}
        className="flex h-8 items-center gap-1 rounded-chip border border-white/5 bg-surface-1 px-3 text-[12px] text-ink-secondary transition hover:bg-surface-2 hover:text-ink-primary disabled:cursor-not-allowed disabled:opacity-30"
        aria-label="Next page"
      >
        Next
        <Icon name="chevron-right" size={14} />
      </button>
    </nav>
  );
}
