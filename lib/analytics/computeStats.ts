// Aggregate stats for the analytics page. Pure functions — no I/O.

export interface AnalyticsRow {
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
  signal_price: number | null;
}

export interface SummaryStats {
  total: number;
  wins: number;        // WIN_TP1 + WIN_TP2
  losses: number;      // LOSS_SL
  open: number;        // OPEN
  pending: number;     // PENDING
  skipped: number;     // SKIP_WAIT + NO_DATA + ERROR
  decided: number;     // wins + losses (the ones we have a verdict for)
  winRate: number | null;
  totalPnl: number;    // sum of pnl_pct (only for decided trades)
  avgPnl: number | null;
  bestPnl: number | null;
  worstPnl: number | null;
  profitFactor: number | null;  // sum(positive PnL) / abs(sum(negative PnL))
  longestWinStreak: number;
  longestLossStreak: number;
  maxDrawdownPct: number;
  avgRR: number | null;
}

export interface OutcomeBreakdown {
  WIN_TP1: number;
  WIN_TP2: number;
  LOSS_SL: number;
  OPEN: number;
  PENDING: number;
  SKIP_WAIT: number;
  NO_DATA_OR_ERROR: number;
}

export interface EquityPoint {
  t: number;       // unix ms
  cumPnl: number;  // cumulative PnL %
}

export interface DailyPoint {
  date: string;    // YYYY-MM-DD
  pnl: number;     // sum of PnL % that day
  count: number;
  wins: number;
  losses: number;
}

export interface SymbolStat {
  symbol: string;
  count: number;
  wins: number;
  losses: number;
  winRate: number | null;
  totalPnl: number;
  avgPnl: number | null;
}

export interface HourlyStat {
  hour: number;   // 0..23 (in user's tz — caller decides)
  count: number;
  wins: number;
  losses: number;
  winRate: number | null;
  totalPnl: number;
}

export interface RollingPoint {
  t: number;
  winRate: number;
}

export interface AllAnalytics {
  summary: SummaryStats;
  outcomes: OutcomeBreakdown;
  equity: EquityPoint[];
  daily: DailyPoint[];
  bySymbol: SymbolStat[];
  byInterval: { interval: string; count: number; winRate: number | null; totalPnl: number }[];
  byHour: HourlyStat[];
  rollingWinRate: RollingPoint[];
}

const WIN_OUTCOMES = new Set(["WIN_TP1", "WIN_TP2"]);
const LOSS_OUTCOMES = new Set(["LOSS_SL"]);
const TERMINAL_OUTCOMES = new Set(["WIN_TP1", "WIN_TP2", "LOSS_SL"]);
const SKIP_OUTCOMES = new Set(["SKIP_WAIT", "NO_DATA", "ERROR"]);

function entryRef(r: AnalyticsRow): number | null {
  if (r.signal_price !== null && Number.isFinite(r.signal_price)) return r.signal_price;
  if (r.entry_low !== null && r.entry_high !== null) {
    return (r.entry_low + r.entry_high) / 2;
  }
  return null;
}

function rrFor(r: AnalyticsRow): number | null {
  const e = entryRef(r);
  if (e === null || r.stop_loss_num === null || r.take_profit_1_num === null) return null;
  const risk = Math.abs(e - r.stop_loss_num);
  const reward = Math.abs(r.take_profit_1_num - e);
  if (risk === 0) return null;
  return reward / risk;
}

export function computeAll(rows: AnalyticsRow[]): AllAnalytics {
  // Sort ascending by time so equity & streaks make sense
  const sorted = [...rows].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  // ----- Summary -----
  const summary: SummaryStats = {
    total: sorted.length,
    wins: 0,
    losses: 0,
    open: 0,
    pending: 0,
    skipped: 0,
    decided: 0,
    winRate: null,
    totalPnl: 0,
    avgPnl: null,
    bestPnl: null,
    worstPnl: null,
    profitFactor: null,
    longestWinStreak: 0,
    longestLossStreak: 0,
    maxDrawdownPct: 0,
    avgRR: null,
  };
  const outcomes: OutcomeBreakdown = {
    WIN_TP1: 0,
    WIN_TP2: 0,
    LOSS_SL: 0,
    OPEN: 0,
    PENDING: 0,
    SKIP_WAIT: 0,
    NO_DATA_OR_ERROR: 0,
  };

  let pnlSum = 0,
    pnlN = 0,
    grossWin = 0,
    grossLoss = 0;
  let curWinStreak = 0,
    curLossStreak = 0,
    bestWinStreak = 0,
    bestLossStreak = 0;

  let cum = 0;
  let peak = 0;
  let maxDd = 0;
  const equity: EquityPoint[] = [];

  const rrs: number[] = [];

  for (const r of sorted) {
    // outcome buckets
    switch (r.outcome) {
      case "WIN_TP1": outcomes.WIN_TP1++; break;
      case "WIN_TP2": outcomes.WIN_TP2++; break;
      case "LOSS_SL": outcomes.LOSS_SL++; break;
      case "OPEN": outcomes.OPEN++; break;
      case "PENDING": outcomes.PENDING++; break;
      case "SKIP_WAIT": outcomes.SKIP_WAIT++; break;
      case "NO_DATA":
      case "ERROR":
        outcomes.NO_DATA_OR_ERROR++;
        break;
    }

    if (WIN_OUTCOMES.has(r.outcome ?? "")) summary.wins++;
    else if (LOSS_OUTCOMES.has(r.outcome ?? "")) summary.losses++;
    else if (r.outcome === "OPEN") summary.open++;
    else if (r.outcome === "PENDING") summary.pending++;
    else if (SKIP_OUTCOMES.has(r.outcome ?? "")) summary.skipped++;

    if (TERMINAL_OUTCOMES.has(r.outcome ?? "") && typeof r.pnl_pct === "number") {
      pnlSum += r.pnl_pct;
      pnlN++;
      if (summary.bestPnl === null || r.pnl_pct > summary.bestPnl) summary.bestPnl = r.pnl_pct;
      if (summary.worstPnl === null || r.pnl_pct < summary.worstPnl) summary.worstPnl = r.pnl_pct;
      if (r.pnl_pct >= 0) grossWin += r.pnl_pct;
      else grossLoss += Math.abs(r.pnl_pct);

      // Streaks
      if (r.pnl_pct > 0) {
        curWinStreak++;
        curLossStreak = 0;
        if (curWinStreak > bestWinStreak) bestWinStreak = curWinStreak;
      } else if (r.pnl_pct < 0) {
        curLossStreak++;
        curWinStreak = 0;
        if (curLossStreak > bestLossStreak) bestLossStreak = curLossStreak;
      }

      // Equity curve & drawdown
      cum += r.pnl_pct;
      equity.push({
        t: new Date(r.outcome_at ?? r.created_at).getTime(),
        cumPnl: Math.round(cum * 100) / 100,
      });
      if (cum > peak) peak = cum;
      const dd = peak - cum;
      if (dd > maxDd) maxDd = dd;
    }

    const rr = rrFor(r);
    if (rr !== null) rrs.push(rr);
  }

  summary.decided = summary.wins + summary.losses;
  if (summary.decided > 0) {
    summary.winRate = Math.round((summary.wins / summary.decided) * 1000) / 10;
  }
  summary.totalPnl = Math.round(pnlSum * 100) / 100;
  if (pnlN > 0) summary.avgPnl = Math.round((pnlSum / pnlN) * 100) / 100;
  if (grossLoss > 0) summary.profitFactor = Math.round((grossWin / grossLoss) * 100) / 100;
  else if (grossWin > 0) summary.profitFactor = null; // infinity-ish — show as "∞"
  summary.longestWinStreak = bestWinStreak;
  summary.longestLossStreak = bestLossStreak;
  summary.maxDrawdownPct = Math.round(maxDd * 100) / 100;
  if (rrs.length > 0) {
    const avgRR = rrs.reduce((a, b) => a + b, 0) / rrs.length;
    summary.avgRR = Math.round(avgRR * 100) / 100;
  }

  // ----- Daily PnL -----
  const dailyMap = new Map<string, DailyPoint>();
  for (const r of sorted) {
    if (!TERMINAL_OUTCOMES.has(r.outcome ?? "")) continue;
    const ts = new Date(r.outcome_at ?? r.created_at);
    const date = ts.toISOString().slice(0, 10);
    const slot = dailyMap.get(date) ?? { date, pnl: 0, count: 0, wins: 0, losses: 0 };
    slot.count++;
    if (typeof r.pnl_pct === "number") slot.pnl += r.pnl_pct;
    if (WIN_OUTCOMES.has(r.outcome ?? "")) slot.wins++;
    else if (LOSS_OUTCOMES.has(r.outcome ?? "")) slot.losses++;
    dailyMap.set(date, slot);
  }
  const daily = [...dailyMap.values()]
    .map((d) => ({ ...d, pnl: Math.round(d.pnl * 100) / 100 }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // ----- By symbol -----
  const symMap = new Map<string, { wins: number; losses: number; total: number; pnl: number; count: number }>();
  for (const r of sorted) {
    if (!TERMINAL_OUTCOMES.has(r.outcome ?? "")) continue;
    const slot = symMap.get(r.symbol) ?? { wins: 0, losses: 0, total: 0, pnl: 0, count: 0 };
    slot.count++;
    if (typeof r.pnl_pct === "number") slot.pnl += r.pnl_pct;
    if (WIN_OUTCOMES.has(r.outcome ?? "")) slot.wins++;
    else if (LOSS_OUTCOMES.has(r.outcome ?? "")) slot.losses++;
    symMap.set(r.symbol, slot);
  }
  const bySymbol: SymbolStat[] = [...symMap.entries()]
    .map(([symbol, s]) => ({
      symbol,
      count: s.count,
      wins: s.wins,
      losses: s.losses,
      winRate:
        s.wins + s.losses === 0 ? null : Math.round((s.wins / (s.wins + s.losses)) * 1000) / 10,
      totalPnl: Math.round(s.pnl * 100) / 100,
      avgPnl: s.count === 0 ? null : Math.round((s.pnl / s.count) * 100) / 100,
    }))
    .sort((a, b) => b.totalPnl - a.totalPnl);

  // ----- By interval -----
  const intMap = new Map<string, { count: number; wins: number; losses: number; pnl: number }>();
  for (const r of sorted) {
    if (!TERMINAL_OUTCOMES.has(r.outcome ?? "")) continue;
    const slot = intMap.get(r.interval) ?? { count: 0, wins: 0, losses: 0, pnl: 0 };
    slot.count++;
    if (typeof r.pnl_pct === "number") slot.pnl += r.pnl_pct;
    if (WIN_OUTCOMES.has(r.outcome ?? "")) slot.wins++;
    else if (LOSS_OUTCOMES.has(r.outcome ?? "")) slot.losses++;
    intMap.set(r.interval, slot);
  }
  const byInterval = [...intMap.entries()].map(([interval, s]) => ({
    interval,
    count: s.count,
    winRate:
      s.wins + s.losses === 0 ? null : Math.round((s.wins / (s.wins + s.losses)) * 1000) / 10,
    totalPnl: Math.round(s.pnl * 100) / 100,
  }));

  // ----- By hour-of-day -----
  const hourSlots: HourlyStat[] = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    count: 0,
    wins: 0,
    losses: 0,
    winRate: null,
    totalPnl: 0,
  }));
  for (const r of sorted) {
    if (!TERMINAL_OUTCOMES.has(r.outcome ?? "")) continue;
    const h = new Date(r.created_at).getHours();
    const slot = hourSlots[h];
    slot.count++;
    if (typeof r.pnl_pct === "number") slot.totalPnl += r.pnl_pct;
    if (WIN_OUTCOMES.has(r.outcome ?? "")) slot.wins++;
    else if (LOSS_OUTCOMES.has(r.outcome ?? "")) slot.losses++;
  }
  hourSlots.forEach((s) => {
    s.totalPnl = Math.round(s.totalPnl * 100) / 100;
    s.winRate = s.wins + s.losses === 0 ? null : Math.round((s.wins / (s.wins + s.losses)) * 1000) / 10;
  });

  // ----- Rolling win rate (window 10) -----
  const window = 10;
  const decidedFlags: { t: number; isWin: boolean }[] = [];
  for (const r of sorted) {
    if (TERMINAL_OUTCOMES.has(r.outcome ?? "")) {
      decidedFlags.push({
        t: new Date(r.outcome_at ?? r.created_at).getTime(),
        isWin: WIN_OUTCOMES.has(r.outcome ?? ""),
      });
    }
  }
  const rolling: RollingPoint[] = [];
  for (let i = 0; i < decidedFlags.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = decidedFlags.slice(start, i + 1);
    const wins = slice.filter((x) => x.isWin).length;
    rolling.push({
      t: decidedFlags[i].t,
      winRate: Math.round((wins / slice.length) * 1000) / 10,
    });
  }

  return {
    summary,
    outcomes,
    equity,
    daily,
    bySymbol,
    byInterval,
    byHour: hourSlots,
    rollingWinRate: rolling,
  };
}
