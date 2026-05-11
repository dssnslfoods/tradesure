import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/guards";
import SignalsTable, { type SignalRow } from "./SignalsTable";
import BacktestButton from "./BacktestButton";
import StatTile from "@/components/ui/StatTile";
import Icon from "@/components/ui/Icon";
import LivePrices from "@/components/ui/LivePrices";

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
  entry_low: number | null;
  entry_high: number | null;
  stop_loss_num: number | null;
  take_profit_1_num: number | null;
  take_profit_2_num: number | null;
  tradingview_signals: { signal: string; price: number | null } | null;
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
         entry_low, entry_high, stop_loss_num, take_profit_1_num, take_profit_2_num,
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
  totalPnl: number;
}

function computeStats(rows: Row[]): Stats {
  const s: Stats = { total: rows.length, wins: 0, losses: 0, open: 0, pending: 0, skipped: 0, winRate: null, totalPnl: 0 };
  let pnlSum = 0;
  for (const r of rows) {
    switch (r.outcome) {
      case "WIN_TP1":
      case "WIN_TP2":
        s.wins++;
        break;
      case "LOSS_SL":
        s.losses++;
        break;
      case "OPEN":
        s.open++;
        break;
      case "PENDING":
        s.pending++;
        break;
      case "SKIP_WAIT":
      case "SKIP_LOW_CONF":
      case "SKIP_HOUR":
      case "NO_DATA":
      case "ERROR":
        s.skipped++;
        break;
    }
    if (typeof r.pnl_pct === "number") pnlSum += r.pnl_pct;
  }
  const decided = s.wins + s.losses;
  if (decided > 0) s.winRate = Math.round((s.wins / decided) * 1000) / 10;
  s.totalPnl = Math.round(pnlSum * 100) / 100;
  return s;
}

export default async function DashboardPage() {
  const me = await getCurrentUser();
  const isAdmin = Boolean(me?.is_admin);
  const rows = await loadRows();
  const stats = computeStats(rows);

  // Build a tiny equity-like sparkline from the last decided signals
  const sparkSeed = rows
    .filter((r) => typeof r.pnl_pct === "number")
    .slice(0, 30)
    .reverse()
    .map((r) => r.pnl_pct as number);
  const equitySpark: number[] = [];
  let acc = 0;
  for (const v of sparkSeed) {
    acc += v;
    equitySpark.push(acc);
  }

  // Unique symbols currently monitored (for live price ticker)
  const monitoredSymbols = Array.from(new Set(rows.map((r) => r.symbol))).filter(
    (s) => s.endsWith("USDT")
  );

  return (
    <>
      {/* Hero */}
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Live signals · Last 24h</div>
          <h1 className="mt-1 text-[24px] font-bold tracking-tightest text-ink-primary sm:text-[32px]">
            Signal Dashboard
          </h1>
          <p className="mt-1 text-[13px] text-ink-secondary">
            TradingView signals enriched with AI analysis and backtested against Binance market data.
          </p>
        </div>
        {isAdmin && (
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <BacktestButton />
          </div>
        )}
      </div>

      {/* Live prices ticker */}
      {monitoredSymbols.length > 0 && (
        <div className="mb-5">
          <LivePrices symbols={monitoredSymbols} />
        </div>
      )}

      {/* KPI tiles */}
      <section className="mb-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile
          label="Total signals"
          value={stats.total}
          icon="device-analytics"
          tone="neutral"
        />
        <StatTile
          label="Wins"
          value={stats.wins}
          icon="circle-check"
          tone="buy"
          sub={`${stats.wins + stats.losses > 0 ? `${stats.winRate}% win rate` : "—"}`}
        />
        <StatTile
          label="Losses"
          value={stats.losses}
          icon="circle-x"
          tone="sell"
        />
        <StatTile label="Open" value={stats.open} icon="clock" tone="info" />
        <StatTile
          label="Win rate"
          value={stats.winRate ?? 0}
          decimals={1}
          suffix="%"
          icon="target"
          tone={stats.winRate !== null && stats.winRate >= 50 ? "buy" : "warn"}
        />
        <StatTile
          label="Total PnL"
          value={stats.totalPnl}
          decimals={2}
          prefix={stats.totalPnl >= 0 ? "+" : ""}
          suffix="%"
          icon="trending-up"
          tone={stats.totalPnl >= 0 ? "buy" : "sell"}
          sparkline={equitySpark.length > 1 ? equitySpark : undefined}
          sparkColor={stats.totalPnl >= 0 ? "var(--buy)" : "var(--sell)"}
        />
      </section>

      <SignalsTable
        isAdmin={isAdmin}
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
          entry_low: r.entry_low,
          entry_high: r.entry_high,
          stop_loss_num: r.stop_loss_num,
          take_profit_1_num: r.take_profit_1_num,
          take_profit_2_num: r.take_profit_2_num,
          tv_signal: r.tradingview_signals?.signal ?? null,
          tv_price: r.tradingview_signals?.price ?? null,
        }))}
      />

      <p className="mt-6 flex items-center gap-2 text-[11px] text-ink-muted">
        <Icon name="info" size={12} />
        Backtest uses Binance public klines. First-touch model: SL assumed first when both hit in same bar (pessimistic). Window = 200 bars after signal time.
      </p>
    </>
  );
}
