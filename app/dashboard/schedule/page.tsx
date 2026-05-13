import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getScheduleConfig,
  getMaskedApiKeys,
  isWithinAiSchedule,
  listRecentRuns,
} from "@/lib/schedule/settings";
import { findModel } from "@/lib/ai/models";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/guards";
import ScheduleControls from "./ScheduleControls";
import ConfigDetailModal, { type ConfigDetailData } from "./ConfigDetailModal";
import Icon, { type IconName } from "@/components/ui/Icon";

async function countQueuedSignals(): Promise<number> {
  try {
    const supabase = getSupabaseAdmin();
    const { count, error } = await supabase
      .from("ai_signal_analysis")
      .select("id", { count: "exact", head: true })
      .eq("outcome", "QUEUED");
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function countTelegramContacts(): Promise<number> {
  try {
    const supabase = getSupabaseAdmin();
    const { count, error } = await supabase
      .from("auth_users")
      .select("id", { count: "exact", head: true })
      .not("telegram_chat_id", "is", null);
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function countTotalSignals(): Promise<number> {
  try {
    const supabase = getSupabaseAdmin();
    const { count, error } = await supabase
      .from("ai_signal_analysis")
      .select("id", { count: "exact", head: true });
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

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
  if (t === "manual") return "chip-warn";
  if (t === "cron") return "chip-info";
  return "chip-mute";
}

export default async function SchedulePage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/dashboard/schedule");
  if (!me.is_admin) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="text-[22px] font-bold text-sig-sell">Access denied</h1>
        <p className="mt-2 text-[13px] text-ink-muted">หน้านี้สำหรับ admin เท่านั้น</p>
        <Link href="/dashboard" className="btn btn-secondary mt-6 inline-flex">
          กลับไป Dashboard
        </Link>
      </div>
    );
  }

  const [config, runs, queuedCount, apiKeys, telegramContactCount, totalSignals] =
    await Promise.all([
      getScheduleConfig(),
      listRecentRuns(10),
      countQueuedSignals(),
      getMaskedApiKeys(),
      countTelegramContacts(),
      countTotalSignals(),
    ]);

  // Build the structured payload that powers the View-configuration modal.
  // We deliberately compute this server-side so secrets/env stay off the wire.
  const primaryModelInfo = findModel(config.ai_model);
  const secondaryModelInfo = findModel(config.ai_model_secondary);
  const configDetail: ConfigDetailData = {
    config,
    apiKeys,
    queuedCount,
    telegramContactCount,
    totalSignals,
    aiActiveNow: isWithinAiSchedule(config.ai_active_windows, config.ai_active_days),
    primaryModelInfo: primaryModelInfo
      ? {
          label: primaryModelInfo.label,
          provider: primaryModelInfo.provider,
          description: primaryModelInfo.description,
        }
      : null,
    secondaryModelInfo: secondaryModelInfo
      ? {
          label: secondaryModelInfo.label,
          provider: secondaryModelInfo.provider,
          description: secondaryModelInfo.description,
        }
      : null,
    envFlags: {
      MIN_CONFIDENCE: process.env.MIN_CONFIDENCE ?? "70",
      BLOCKED_HOURS: process.env.BLOCKED_HOURS ?? "13,14,16,17,20",
      NOTRADE_TELEGRAM: process.env.NOTRADE_TELEGRAM ?? "1",
    },
  };

  const totalEvaluated = runs.reduce((a, r) => a + r.evaluated, 0);
  const cronRuns = runs.filter((r) => r.triggered_by === "cron").length;
  const errorRuns = runs.filter((r) => r.error).length;

  return (
    <>
      <header className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Admin · Auto-evaluator</div>
          <h1 className="mt-1 text-[24px] font-bold tracking-tightest text-ink-primary sm:text-[32px]">
            Backtest Schedule
          </h1>
          <p className="mt-1 text-[13px] text-ink-secondary">
            Pause / resume the auto-evaluator and view recent runs.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <ConfigDetailModal data={configDetail} />
          <div className="text-right text-[11px] text-ink-muted">
            <div>Last run: <span className="font-mono text-ink-secondary">{fmtTime(config.last_run_at)}</span></div>
            {config.last_result && (
              <div className="mt-1">
                {config.last_result.evaluated} evaluated ·{" "}
                <span className="text-sig-buy">{config.last_result.win}W</span> /{" "}
                <span className="text-sig-sell">{config.last_result.loss}L</span> /{" "}
                <span className="text-sig-info">{config.last_result.open}O</span> ·{" "}
                win-rate {config.last_result.win_rate_pct ?? "-"}%
              </div>
            )}
          </div>
        </div>
      </header>

      <section className="mb-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="Cron runs (recent)" value={String(cronRuns)} icon="refresh" />
        <MiniStat label="Total evaluated" value={String(totalEvaluated)} icon="device-analytics" />
        <MiniStat
          label="Errors (recent)"
          value={String(errorRuns)}
          tone={errorRuns > 0 ? "sell" : "neutral"}
          icon="alert-triangle"
        />
        <MiniStat
          label="Display interval"
          value={`${config.interval_minutes} min`}
          icon="clock"
        />
      </section>

      <ScheduleControls config={config} queuedCount={queuedCount} apiKeys={apiKeys} />

      <section className="mt-7">
        <div className="mb-3 flex items-center gap-2">
          <Icon name="history" size={14} className="text-ink-secondary" />
          <h2 className="text-[15px] font-semibold text-ink-primary">Recent runs</h2>
          <span className="ml-1 text-[11px] text-ink-muted">({runs.length})</span>
        </div>
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/5 text-[12px]">
              <thead className="bg-surface-2/40 text-left">
                <tr>
                  {["Time","Trigger","Evaluated","W / L / O","Win rate","Duration","Error"].map(h => (
                    <th key={h} className="px-4 py-3 eyebrow !text-[10px]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {runs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-ink-muted">
                      ยังไม่มีการรัน — รอ Cloud Scheduler หรือกดปุ่ม Run backtest now
                    </td>
                  </tr>
                )}
                {runs.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-2/30">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-ink-secondary">
                      {fmtTime(r.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`chip ${triggerBadge(r.triggered_by)} !text-[10px]`}>
                        {r.triggered_by}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular text-ink-primary">{r.evaluated}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular">
                      <span className="text-sig-buy">{r.win}</span>
                      <span className="text-ink-faint"> / </span>
                      <span className="text-sig-sell">{r.loss}</span>
                      <span className="text-ink-faint"> / </span>
                      <span className="text-sig-info">{r.open}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular text-ink-secondary">
                      {r.win_rate_pct === null ? "-" : `${r.win_rate_pct}%`}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular text-ink-muted">
                      {fmtDuration(r.duration_ms)}
                    </td>
                    <td className="px-4 py-3 text-sig-sell text-[11px]">{r.error ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="card mt-6 p-5 text-[12px] text-ink-secondary">
        <div className="flex items-center gap-2">
          <Icon name="info" size={14} className="text-sig-info" />
          <span className="font-semibold text-ink-primary">Cloud Scheduler info</span>
        </div>
        <p className="mt-2 text-ink-muted">
          ความถี่จริงของการรันถูกควบคุมโดย Cloud Scheduler.
        </p>
        <a
          href="https://console.cloud.google.com/cloudscheduler?project=tradesure-800aa"
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 text-brand hover:underline"
        >
          <Icon name="external" size={12} />
          Open in Google Cloud Console
        </a>
        <p className="mt-2 text-ink-muted">
          การกด Pause ที่นี่จะทำให้ endpoint ตอบ{" "}
          <code className="font-mono text-brand">{`{ ok: true, skipped: true }`}</code>{" "}
          ทันที — Cloud Scheduler ไม่ต้องหยุด
        </p>
      </section>
    </>
  );
}

function MiniStat({
  label,
  value,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "buy" | "sell" | "warn" | "info";
  icon?: IconName;
}) {
  const cls = {
    neutral: "text-ink-primary",
    buy: "text-sig-buy",
    sell: "text-sig-sell",
    warn: "text-sig-warn",
    info: "text-sig-info",
  }[tone];
  const iconBg = {
    neutral: "bg-surface-2 text-ink-secondary",
    buy: "bg-sig-buy/15 text-sig-buy",
    sell: "bg-sig-sell/15 text-sig-sell",
    warn: "bg-sig-warn/15 text-sig-warn",
    info: "bg-sig-info/15 text-sig-info",
  }[tone];
  return (
    <div className="card flex items-center gap-3 p-4">
      {icon && (
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-chip ${iconBg}`}>
          <Icon name={icon} size={16} />
        </span>
      )}
      <div className="min-w-0">
        <div className="eyebrow !text-[10px]">{label}</div>
        <div className={`mt-1 text-[18px] font-bold tabular ${cls}`}>{value}</div>
      </div>
    </div>
  );
}
