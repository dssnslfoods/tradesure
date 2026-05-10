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
  ConfidenceVsWinRate,
} from "./Charts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface DbRow {
  id: string;
  created_at: string;
  symbol: string;
  interval: string;
  bias: string | null;
  confidence: number | null;
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
        `id, created_at, symbol, interval, bias, confidence, outcome, pnl_pct, outcome_at,
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
      confidence: r.confidence,
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
    <>
      <header className="mb-7">
        <div className="eyebrow">Performance · {rows.length} signals</div>
        <h1 className="mt-1 text-[32px] font-bold tracking-tightest text-ink-primary">
          Analytics
        </h1>
        <p className="mt-1 text-[13px] text-ink-secondary">
          สถิติและกราฟ — อัปเดตอัตโนมัติเมื่อมี signal ใหม่หรือ backtest รัน
        </p>
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

        <ConfidenceVsWinRate
          buckets={a.byConfidence}
          correlation={a.confidenceCorrelation}
        />

        <HourOfDayHeatmap data={a.byHour} />
      </div>

      <p className="mt-6 text-[11px] italic text-ink-muted">
        ข้อมูลนับเฉพาะ signal ที่ outcome เป็น WIN_TP1, WIN_TP2 หรือ LOSS_SL — ไม่รวม PENDING / OPEN / NO TRADE
      </p>
    </>
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
    emerald: "text-sig-buy",
    rose: "text-sig-sell",
    amber: "text-sig-warn",
    sky: "text-sig-info",
    slate: "text-ink-primary",
  }[tone];
  return (
    <div className="card p-4">
      <div className="eyebrow !text-[10px]">{label}</div>
      <div className={`mt-1 text-[20px] font-bold tabular ${cls}`}>{value}</div>
      {sub && <div className="text-[10px] text-ink-muted">{sub}</div>}
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
    <div className="card p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-ink-primary">By timeframe</h3>
        <span className="text-[11px] text-ink-muted">{sorted.length} interval(s)</span>
      </div>
      {sorted.length === 0 ? (
        <div className="py-6 text-center text-[12px] text-ink-muted">ยังไม่มีข้อมูล</div>
      ) : (
        <table className="w-full text-[12px]">
          <thead className="text-left">
            <tr>
              {["Interval","Trades","Win rate","Total PnL"].map((h, i) => (
                <th key={h} className={`py-2 eyebrow !text-[10px] ${i > 0 ? "text-right" : ""}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {sorted.map((d) => (
              <tr key={d.interval}>
                <td className="py-2.5 font-semibold text-ink-primary">{d.interval}</td>
                <td className="py-2.5 text-right tabular text-ink-secondary">{d.count}</td>
                <td className="py-2.5 text-right tabular text-ink-secondary">
                  {d.winRate === null ? "-" : `${d.winRate}%`}
                </td>
                <td
                  className={`py-2.5 text-right tabular font-semibold ${
                    d.totalPnl >= 0 ? "text-sig-buy" : "text-sig-sell"
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
