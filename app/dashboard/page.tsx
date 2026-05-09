import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import BacktestButton from "./BacktestButton";
import SignalsTable, { type SignalRow } from "./SignalsTable";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Row {
  id: string;
  created_at: string;
  symbol: string;
  interval: string;
  bias: string | null;
  confidence: number | null;
  risk_level: string | null;
  telegram_sent: boolean;
  summary_th: string | null;
  signal_id: string;
  outcome: string | null;
  pnl_pct: number | null;
  outcome_at: string | null;
  bars_evaluated: number | null;
  tradingview_signals: {
    signal: string;
    price: number | null;
  } | null;
}

function fmtPnl(p: number | null) {
  if (p === null || p === undefined) return "-";
  const sign = p >= 0 ? "+" : "";
  return `${sign}${p.toFixed(2)}%`;
}

async function loadRows(): Promise<Row[]> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("ai_signal_analysis")
      .select(
        `id, created_at, symbol, interval, bias, confidence, risk_level,
         telegram_sent, summary_th, signal_id,
         outcome, pnl_pct, outcome_at, bars_evaluated,
         tradingview_signals:signal_id ( signal, price )`
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return (data ?? []) as unknown as Row[];
  } catch {
    return [];
  }
}

interface Stats {
  total: number;
  wins: number;
  losses: number;
  open: number;
  pending: number;
  skipped: number;
  winRate: number | null;
  avgPnl: number | null;
  totalPnl: number;
}

function computeStats(rows: Row[]): Stats {
  const stats: Stats = {
    total: rows.length,
    wins: 0,
    losses: 0,
    open: 0,
    pending: 0,
    skipped: 0,
    winRate: null,
    avgPnl: null,
    totalPnl: 0,
  };
  let pnlSum = 0;
  let pnlN = 0;
  for (const r of rows) {
    switch (r.outcome) {
      case "WIN_TP1":
      case "WIN_TP2":
        stats.wins++;
        break;
      case "LOSS_SL":
        stats.losses++;
        break;
      case "OPEN":
        stats.open++;
        break;
      case "PENDING":
        stats.pending++;
        break;
      case "SKIP_WAIT":
      case "NO_DATA":
      case "ERROR":
        stats.skipped++;
        break;
    }
    if (typeof r.pnl_pct === "number") {
      pnlSum += r.pnl_pct;
      pnlN++;
    }
  }
  const decided = stats.wins + stats.losses;
  if (decided > 0) {
    stats.winRate = Math.round((stats.wins / decided) * 1000) / 10;
  }
  if (pnlN > 0) {
    stats.avgPnl = Math.round((pnlSum / pnlN) * 100) / 100;
    stats.totalPnl = Math.round(pnlSum * 100) / 100;
  }
  return stats;
}

export default async function DashboardPage() {
  const rows = await loadRows();
  const stats = computeStats(rows);

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">📈 Crypto AI Signals</h1>
          <p className="mt-1 text-sm text-slate-400">
            Latest TradingView signals enriched with AI analysis and backtested against real market data.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/schedule"
            className="rounded-lg border border-crypto-border bg-crypto-panel px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-black/30"
          >
            ⏰ Schedule
          </Link>
          <BacktestButton />
        </div>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <StatCard label="Total" value={String(stats.total)} />
        <StatCard label="Wins" value={String(stats.wins)} accent="emerald" />
        <StatCard label="Losses" value={String(stats.losses)} accent="rose" />
        <StatCard label="Open" value={String(stats.open)} accent="sky" />
        <StatCard
          label="Win rate"
          value={stats.winRate === null ? "-" : `${stats.winRate}%`}
          accent={stats.winRate && stats.winRate >= 50 ? "emerald" : "rose"}
        />
        <StatCard
          label="Total PnL"
          value={fmtPnl(stats.totalPnl)}
          accent={stats.totalPnl >= 0 ? "emerald" : "rose"}
        />
      </section>

      <SignalsTable
        rows={rows.map<SignalRow>((r) => ({
          id: r.id,
          signal_id: r.signal_id,
          created_at: r.created_at,
          symbol: r.symbol,
          interval: r.interval,
          bias: r.bias,
          confidence: r.confidence,
          risk_level: r.risk_level,
          telegram_sent: r.telegram_sent,
          outcome: r.outcome,
          pnl_pct: r.pnl_pct,
          bars_evaluated: r.bars_evaluated,
          tv_signal: r.tradingview_signals?.signal ?? null,
          tv_price: r.tradingview_signals?.price ?? null,
        }))}
      />

      <p className="mt-4 text-xs text-slate-500">
        Backtest uses Binance public klines. First-touch model: if TP and SL are
        both hit in the same bar, the SL is assumed first (pessimistic). Window =
        first 200 bars after signal time.
      </p>
    </main>
  );
}

function StatCard({
  label,
  value,
  accent = "slate",
}: {
  label: string;
  value: string;
  accent?: "emerald" | "rose" | "sky" | "slate";
}) {
  const tone = {
    emerald: "text-emerald-300",
    rose: "text-rose-300",
    sky: "text-sky-300",
    slate: "text-slate-200",
  }[accent];
  return (
    <div className="rounded-lg border border-crypto-border bg-crypto-panel p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}
