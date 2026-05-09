import Link from "next/link";
import { getScheduleConfig, listRecentRuns } from "@/lib/schedule/settings";
import ScheduleControls from "./ScheduleControls";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function fmtTime(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("en-GB", { hour12: false });
}

function fmtDuration(ms: number | null) {
  if (ms === null || ms === undefined) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function triggerBadge(t: string) {
  const base = "rounded px-2 py-0.5 text-xs font-semibold uppercase";
  if (t === "manual") return `${base} bg-crypto-accent/20 text-amber-300`;
  if (t === "cron") return `${base} bg-sky-500/20 text-sky-300`;
  return `${base} bg-slate-500/20 text-slate-300`;
}

export default async function SchedulePage() {
  const config = await getScheduleConfig();
  const runs = await listRecentRuns(20);

  const totalEvaluated = runs.reduce((a, r) => a + r.evaluated, 0);
  const cronRuns = runs.filter((r) => r.triggered_by === "cron").length;
  const errorRuns = runs.filter((r) => r.error).length;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href="/dashboard"
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            ← Back to dashboard
          </Link>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            ⏰ Backtest schedule
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Pause / resume the auto-evaluator and view recent runs.
          </p>
        </div>
        <div className="text-right text-xs text-slate-400">
          <div>Last run: {fmtTime(config.last_run_at)}</div>
          {config.last_result && (
            <div>
              {config.last_result.evaluated} evaluated · {config.last_result.win}W /{" "}
              {config.last_result.loss}L / {config.last_result.open}O · win-rate{" "}
              {config.last_result.win_rate_pct ?? "-"}%
            </div>
          )}
        </div>
      </header>

      <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Cron runs (recent)" value={String(cronRuns)} />
        <Stat label="Total evaluated" value={String(totalEvaluated)} />
        <Stat
          label="Errors (recent)"
          value={String(errorRuns)}
          accent={errorRuns > 0 ? "rose" : "slate"}
        />
        <Stat
          label="Display interval"
          value={`${config.interval_minutes} min`}
        />
      </section>

      <ScheduleControls config={config} />

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">Recent runs</h2>
        <div className="overflow-hidden rounded-xl border border-crypto-border bg-crypto-panel">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-crypto-border text-sm">
              <thead className="bg-black/30 text-left text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Trigger</th>
                  <th className="px-4 py-3">Evaluated</th>
                  <th className="px-4 py-3">W / L / O</th>
                  <th className="px-4 py-3">Win rate</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-crypto-border">
                {runs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                      ยังไม่มีการรัน — รอ Cloud Scheduler หรือกดปุ่ม Run backtest now
                    </td>
                  </tr>
                )}
                {runs.map((r) => (
                  <tr key={r.id} className="hover:bg-black/20">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-300">
                      {fmtTime(r.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={triggerBadge(r.triggered_by)}>
                        {r.triggered_by}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                      {r.evaluated}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                      <span className="text-emerald-400">{r.win}</span>
                      {" / "}
                      <span className="text-rose-400">{r.loss}</span>
                      {" / "}
                      <span className="text-sky-400">{r.open}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                      {r.win_rate_pct === null ? "-" : `${r.win_rate_pct}%`}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-400">
                      {fmtDuration(r.duration_ms)}
                    </td>
                    <td className="px-4 py-3 text-rose-300">
                      {r.error ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mt-8 rounded-xl border border-crypto-border bg-crypto-panel/60 p-4 text-xs text-slate-400">
        <p className="font-semibold text-slate-300">Cloud Scheduler info</p>
        <p className="mt-2">
          ความถี่จริงของการรันถูกควบคุมโดย Cloud Scheduler ที่:
        </p>
        <a
          href="https://console.cloud.google.com/cloudscheduler?project=tradesure-800aa"
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-emerald-300 hover:underline"
        >
          → Open Cloud Scheduler in Google Cloud Console
        </a>
        <p className="mt-2">
          การกด Pause ที่นี่จะทำให้ endpoint ตอบ <code>{`{ ok: true, skipped: true }`}</code>{" "}
          ทันที โดยไม่ทำงานจริง — Cloud Scheduler ไม่ต้องหยุด
        </p>
      </section>
    </main>
  );
}

function Stat({
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
