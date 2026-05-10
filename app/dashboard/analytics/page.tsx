import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/guards";
import {
  computeAll,
  type AnalyticsRow,
} from "@/lib/analytics/computeStats";
import {
  EquityCurve,
  OutcomeDonut,
  DailyPnlBars,
  TopSymbols,
  RollingWinRate,
  HourOfDayHeatmap,
} from "./Charts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface DbRow {
  id: string;
  created_at: string;
  symbol: string;
  interval: string;
  bias: string | null;
  outcome: string | null;
  pnl_pct: number | null;
  outcome_at: string | null;
  stop_loss_num: number | null;
  take_profit_1_num: number | null;
  entry_low: number | null;
  entry_high: number | null;
  tradingview_signals: { price: number | null } | null;
}

async function loadAll(): Promise<AnalyticsRow[]> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("ai_signal_analysis")
      .select(
        `id, created_at, symbol, interval, bias, outcome, pnl_pct, outcome_at,
         stop_loss_num, take_profit_1_num, entry_low, entry_high,
         tradingview_signals:signal_id ( price )`
      )
      .order("created_at", { ascending: true })
      .limit(2000);
    if (error) throw error;
    const rows = (data ?? []) as unknown as DbRow[];
    return rows.map((r) => ({
      id: r.id,
      created_at: r.created_at,
      symbol: r.symbol,
      interval: r.interval,
      bias: r.bias,
      outcome: r.outcome,
      pnl_pct: r.pnl_pct,
      outcome_at: r.outcome_at,
      stop_loss_num: r.stop_loss_num,
      take_profit_1_num: r.take_profit_1_num,
      entry_low: r.entry_low,
      entry_high: r.entry_high,
      signal_price: r.tradingview_signals?.price ?? null,
    }));
  } catch {
    return [];
  }
}

export default async function AnalyticsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/dashboard/analytics");

  const rows = await loadAll();
  const a = computeAll(rows);
  const s = a.summary;

  const profitFactorStr =
    s.profitFactor === null
      ? s.wins > 0
        ? "∞"
        : "-"
      : s.profitFactor.toFixed(2);

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">📊 Analytics</h1>
          <p className="mt-1 text-sm text-slate-400">
            สถิติและกราฟจาก signal {rows.length} รายการ
          </p>
        </div>
        <Link
          href="/dashboard"
          className="rounded-lg border border-crypto-border bg-crypto-panel px-4 py-2 text-sm text-slate-200 hover:bg-black/30"
        >
          ← Dashboard
        </Link>
      </header>

      {/* ===== KPI cards ===== */}
      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Total signals" value={String(s.total)} />
        <Kpi
          label="Decided"
          value={String(s.decided)}
          sub={`${s.wins}W · ${s.losses}L`}
        />
        <Kpi
          label="Win rate"
          value={s.winRate === null ? "-" : `${s.winRate}%`}
          tone={s.winRate !== null && s.winRate >= 50 ? "emerald" : "rose"}
        />
        <Kpi
          label="Total PnL"
          value={`${s.totalPnl >= 0 ? "+" : ""}${s.totalPnl}%`}
          tone={s.totalPnl >= 0 ? "emerald" : "rose"}
        />
        <Kpi
          label="Avg PnL / trade"
          value={s.avgPnl === null ? "-" : `${s.avgPnl >= 0 ? "+" : ""}${s.avgPnl}%`}
          tone={s.avgPnl !== null && s.avgPnl >= 0 ? "emerald" : "rose"}
        />
        <Kpi
          label="Profit factor"
          value={profitFactorStr}
          tone={
            s.profitFactor === null
              ? "slate"
              : s.profitFactor >= 1.5
              ? "emerald"
              : s.profitFactor >= 1
              ? "amber"
              : "rose"
          }
        />
      </section>

      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi
          label="Best trade"
          value={s.bestPnl === null ? "-" : `+${s.bestPnl}%`}
          tone="emerald"
        />
        <Kpi
          label="Worst trade"
          value={s.worstPnl === null ? "-" : `${s.worstPnl}%`}
          tone="rose"
        />
        <Kpi
          label="Avg R:R"
          value={s.avgRR === null ? "-" : `${s.avgRR}:1`}
          tone={s.avgRR !== null && s.avgRR >= 1.5 ? "emerald" : "amber"}
        />
        <Kpi
          label="Max drawdown"
          value={`-${s.maxDrawdownPct}%`}
          tone={s.maxDrawdownPct >= 5 ? "rose" : "amber"}
        />
        <Kpi
          label="Win streak"
          value={String(s.longestWinStreak)}
          tone="emerald"
          sub="ติดต่อกันสูงสุด"
        />
        <Kpi
          label="Loss streak"
          value={String(s.longestLossStreak)}
          tone="rose"
          sub="ติดต่อกันสูงสุด"
        />
      </section>

      {/* ===== Charts grid ===== */}
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <EquityCurve points={a.equity} />
          </div>
          <div>
            <OutcomeDonut outcomes={a.outcomes} />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <DailyPnlBars data={a.daily} />
          <RollingWinRate points={a.rollingWinRate} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <TopSymbols data={a.bySymbol} />
          <ByIntervalPanel data={a.byInterval} />
        </div>

        <HourOfDayHeatmap data={a.byHour} />
      </div>

      <p className="mt-6 text-xs text-slate-500">
        ⚠️ <i>ข้อมูลนับเฉพาะ signal ที่ outcome เป็น WIN_TP1, WIN_TP2 หรือ LOSS_SL — ไม่รวม PENDING / OPEN / NO TRADE</i>
      </p>
    </main>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone = "slate",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "emerald" | "rose" | "amber" | "sky" | "slate";
}) {
  const cls = {
    emerald: "text-emerald-300",
    rose: "text-rose-300",
    amber: "text-amber-300",
    sky: "text-sky-300",
    slate: "text-slate-200",
  }[tone];
  return (
    <div className="rounded-lg border border-crypto-border bg-crypto-panel p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${cls}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
    </div>
  );
}

function ByIntervalPanel({
  data,
}: {
  data: { interval: string; count: number; winRate: number | null; totalPnl: number }[];
}) {
  const sorted = [...data].sort((a, b) => b.count - a.count);
  return (
    <div className="rounded-xl border border-crypto-border bg-crypto-panel p-4 shadow-lg">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-200">⏱ By timeframe</h3>
        <span className="text-xs text-slate-500">{sorted.length} interval(s)</span>
      </div>
      {sorted.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-500">ยังไม่มีข้อมูล</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="py-2">Interval</th>
              <th className="py-2 text-right">Trades</th>
              <th className="py-2 text-right">Win rate</th>
              <th className="py-2 text-right">Total PnL</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-crypto-border">
            {sorted.map((d) => (
              <tr key={d.interval}>
                <td className="py-2 font-semibold text-slate-200">{d.interval}</td>
                <td className="py-2 text-right tabular-nums text-slate-300">{d.count}</td>
                <td className="py-2 text-right tabular-nums text-slate-300">
                  {d.winRate === null ? "-" : `${d.winRate}%`}
                </td>
                <td
                  className={`py-2 text-right tabular-nums font-semibold ${
                    d.totalPnl >= 0 ? "text-emerald-300" : "text-rose-300"
                  }`}
                >
                  {d.totalPnl >= 0 ? "+" : ""}
                  {d.totalPnl}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
