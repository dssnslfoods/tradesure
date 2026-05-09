import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import BacktestButton from "./BacktestButton";

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

      <div className="overflow-hidden rounded-xl border border-crypto-border bg-crypto-panel shadow-lg">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-crypto-border text-sm">
            <thead className="bg-black/30 text-left text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Symbol</th>
                <th className="px-4 py-3">TF</th>
                <th className="px-4 py-3">Signal</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">AI Bias</th>
                <th className="px-4 py-3">Conf.</th>
                <th className="px-4 py-3">Risk</th>
                <th className="px-4 py-3">Outcome</th>
                <th className="px-4 py-3">PnL</th>
                <th className="px-4 py-3">TG</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-crypto-border">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-slate-500">
                    No signals yet. Send a test webhook to{" "}
                    <code className="text-emerald-300">/api/webhook/tradingview</code>.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-black/20">
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
                    <span className={signalBadge(r.tradingview_signals?.signal ?? "-")}>
                      {r.tradingview_signals?.signal ?? "-"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-200">
                    {fmtPrice(r.tradingview_signals?.price ?? null)}
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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
