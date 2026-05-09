import { getSupabaseAdmin } from "@/lib/supabase/server";

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

function fmtPrice(v: number | null) {
  if (v === null || v === undefined) return "-";
  return v.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { hour12: false });
}

async function loadRows(): Promise<Row[]> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("ai_signal_analysis")
      .select(
        `id, created_at, symbol, interval, bias, confidence, risk_level,
         telegram_sent, summary_th, signal_id,
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

export default async function DashboardPage() {
  const rows = await loadRows();

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            📈 Crypto AI Signals
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Latest TradingView signals enriched with AI analysis.
          </p>
        </div>
        <span className="rounded-full border border-crypto-border bg-crypto-panel px-3 py-1 text-xs text-slate-300">
          {rows.length} entries
        </span>
      </header>

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
                <th className="px-4 py-3">Telegram</th>
                <th className="px-4 py-3">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-crypto-border">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-slate-500">
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
                    {r.telegram_sent ? (
                      <span className="text-emerald-400">✓ sent</span>
                    ) : (
                      <span className="text-rose-400">✗ failed</span>
                    )}
                  </td>
                  <td className="max-w-xs px-4 py-3 text-slate-300">
                    <span className="line-clamp-2">{r.summary_th ?? "-"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
