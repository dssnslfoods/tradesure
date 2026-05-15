"use client";

import { useState } from "react";
import Icon from "@/components/ui/Icon";
import type { BacktestScheduleConfig, MaskedApiKeys } from "@/lib/schedule/settings";

export interface ConfigDetailData {
  config: BacktestScheduleConfig;
  apiKeys: MaskedApiKeys;
  queuedCount: number;
  telegramContactCount: number;
  totalSignals: number;
  aiActiveNow: boolean;
  primaryModelInfo: { label: string; provider: string; description?: string } | null;
  secondaryModelInfo: { label: string; provider: string; description?: string } | null;
  envFlags: {
    MIN_CONFIDENCE: string;
    BLOCKED_HOURS: string;
    NOTRADE_TELEGRAM: string;
  };
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function StatusPill({
  state,
  label,
}: {
  state: "good" | "warn" | "bad" | "neutral";
  label: string;
}) {
  const cls = {
    good: "chip-buy",
    warn: "chip-warn",
    bad: "chip-sell",
    neutral: "chip-mute",
  }[state];
  return <span className={`chip ${cls} !text-[10px]`}>{label}</span>;
}

function Row({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-white/5 py-2 last:border-0">
      <div className="min-w-0">
        <div className="text-[12px] font-semibold text-ink-secondary">{label}</div>
        {hint && <div className="mt-0.5 text-[10px] text-ink-faint">{hint}</div>}
      </div>
      <div className="text-right font-mono text-[12px] text-ink-primary">{value}</div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-chip border border-white/5 bg-surface-2/40 p-4">
      <div className="mb-2 flex items-center gap-2 border-b border-white/5 pb-2">
        <span className="text-[16px]">{icon}</span>
        <span className="text-[13px] font-bold text-ink-primary">{title}</span>
      </div>
      <div className="space-y-0">{children}</div>
    </div>
  );
}

export default function ConfigDetailModal({ data }: { data: ConfigDetailData }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { config, apiKeys, primaryModelInfo, secondaryModelInfo, envFlags } = data;

  const describeWindows = () => {
    if (config.ai_active_windows.length === 0) return "24h (always on)";
    return config.ai_active_windows
      .map((w) => {
        const s = `${String(w.start).padStart(2, "0")}:00`;
        const e = `${String(w.end).padStart(2, "0")}:00`;
        if (w.start === w.end) return "24h";
        if (w.start > w.end) return `${s}–${e} (overnight)`;
        return `${s}–${e}`;
      })
      .join(" + ");
  };

  const describeDays = () => {
    if (config.ai_active_days.length === 7) return "Every day";
    return config.ai_active_days.map((d) => DAY_NAMES[d]).join(", ");
  };

  // Plain-text dump for copy-to-clipboard / sharing in support tickets
  const copyText = () => {
    const lines = [
      "=== TRADESURE CONFIGURATION ===",
      `Generated: ${new Date().toISOString()}`,
      "",
      "[BACKTEST]",
      `Enabled: ${config.enabled}`,
      `Pause reason: ${config.paused_reason ?? "-"}`,
      `Interval (display): ${config.interval_minutes} min`,
      `Last run: ${config.last_run_at ?? "-"}`,
      "",
      "[CARDS]",
      `Retention: ${config.card_retention_days} days`,
      `Total signals (all-time): ${data.totalSignals}`,
      `Queued (awaiting AI): ${data.queuedCount}`,
      "",
      "[AI MODEL]",
      `Mode: ${config.ai_mode}`,
      `Primary: ${config.ai_model} (${primaryModelInfo?.provider ?? "?"})`,
      config.ai_mode !== "single"
        ? `Secondary: ${config.ai_model_secondary} (${secondaryModelInfo?.provider ?? "?"})`
        : "Secondary: (not used)",
      "",
      "[AI KEYS]",
      `OpenAI: ${apiKeys.openai.source.toUpperCase()} ${apiKeys.openai.mask ?? ""}`,
      `Gemini: ${apiKeys.gemini.source.toUpperCase()} ${apiKeys.gemini.mask ?? ""}`,
      "",
      "[AI SCHEDULE]",
      `Active days: ${describeDays()}`,
      `Hour windows: ${describeWindows()}`,
      `Currently active: ${data.aiActiveNow ? "YES" : "NO (gated)"}`,
      "",
      "[FILTERS / ENV]",
      `MIN_CONFIDENCE: ${envFlags.MIN_CONFIDENCE}`,
      `BLOCKED_HOURS:  ${envFlags.BLOCKED_HOURS}`,
      `NOTRADE_TELEGRAM: ${envFlags.NOTRADE_TELEGRAM}`,
      "",
      "[CONNECTIONS]",
      `Telegram contacts: ${data.telegramContactCount}`,
      "",
      "=== END ===",
    ];
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-secondary"
      >
        <Icon name="eye" size={14} />
        View configuration
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="card my-4 w-full max-w-3xl space-y-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/5 pb-4">
              <div>
                <div className="eyebrow">Admin diagnostics</div>
                <h2 className="mt-1 text-[20px] font-bold text-ink-primary">
                  Current configuration
                </h2>
                <p className="mt-1 text-[12px] text-ink-muted">
                  ตรวจสอบทุกค่าที่กำลังใช้งานจริง ก่อนแก้ไขหรือ debug
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={copyText}
                  className="btn btn-ghost"
                >
                  <Icon name="download" size={12} />
                  {copied ? "Copied ✓" : "Copy text"}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded border border-white/5 bg-surface-2 text-ink-secondary hover:bg-surface-3"
                  aria-label="Close"
                >
                  <Icon name="x" size={14} />
                </button>
              </div>
            </div>

            {/* ── 1. System state ── */}
            <Section title="System state" icon="🟢">
              <Row
                label="Backtest scheduler"
                value={
                  <StatusPill
                    state={config.enabled ? "good" : "warn"}
                    label={config.enabled ? "Active" : "Paused"}
                  />
                }
              />
              {!config.enabled && (
                <Row label="Pause reason" value={config.paused_reason ?? "—"} />
              )}
              <Row
                label="Display interval"
                value={`${config.interval_minutes} min`}
                hint="UI only — real cadence is Cloud Scheduler"
              />
              <Row label="Last run" value={config.last_run_at ?? "—"} />
              <Row
                label="Total signals (lifetime)"
                value={data.totalSignals.toString()}
              />
            </Section>

            {/* ── 2. AI configuration ── */}
            <Section title="AI configuration" icon="🤖">
              <Row
                label="Mode"
                value={
                  <StatusPill
                    state={
                      config.ai_mode === "vote"
                        ? "good"
                        : config.ai_mode === "compare"
                        ? "neutral"
                        : "neutral"
                    }
                    label={
                      config.ai_mode === "vote"
                        ? "Vote (consensus)"
                        : config.ai_mode === "compare"
                        ? "Compare (parallel)"
                        : "Single (default)"
                    }
                  />
                }
                hint={
                  config.ai_mode === "vote"
                    ? "ทั้ง 2 AI ต้อง agree ถึงจะส่ง Telegram"
                    : config.ai_mode === "compare"
                    ? "ทั้ง 2 AI ทำงานพร้อมกัน — แสดง 2 ความเห็น"
                    : "Primary AI เท่านั้น"
                }
              />
              <Row
                label="Primary model"
                value={
                  <span>
                    {config.ai_model}
                    {primaryModelInfo && (
                      <span className="ml-2 text-[10px] text-ink-muted">
                        ({primaryModelInfo.provider})
                      </span>
                    )}
                  </span>
                }
              />
              {config.ai_mode !== "single" && (
                <Row
                  label="Secondary model"
                  value={
                    <span>
                      {config.ai_model_secondary}
                      {secondaryModelInfo && (
                        <span className="ml-2 text-[10px] text-ink-muted">
                          ({secondaryModelInfo.provider})
                        </span>
                      )}
                    </span>
                  }
                />
              )}
            </Section>

            {/* ── 3. API keys ── */}
            <Section title="API keys" icon="🔑">
              <Row
                label="OpenAI"
                value={
                  apiKeys.openai.configured ? (
                    <span>
                      <StatusPill
                        state={apiKeys.openai.source === "db" ? "good" : "neutral"}
                        label={apiKeys.openai.source === "db" ? "DB" : "ENV"}
                      />
                      <span className="ml-2 text-[11px]">{apiKeys.openai.mask}</span>
                    </span>
                  ) : (
                    <StatusPill state="bad" label="Not set" />
                  )
                }
              />
              <Row
                label="Google Gemini"
                value={
                  apiKeys.gemini.configured ? (
                    <span>
                      <StatusPill
                        state={apiKeys.gemini.source === "db" ? "good" : "neutral"}
                        label={apiKeys.gemini.source === "db" ? "DB" : "ENV"}
                      />
                      <span className="ml-2 text-[11px]">{apiKeys.gemini.mask}</span>
                    </span>
                  ) : (
                    <StatusPill state="bad" label="Not set" />
                  )
                }
                hint={
                  config.ai_mode !== "single" &&
                  config.ai_model_secondary.startsWith("gemini") &&
                  !apiKeys.gemini.configured
                    ? "⚠️ Secondary model = Gemini แต่ไม่มี key — analysis จะ fail!"
                    : undefined
                }
              />
            </Section>

            {/* ── 4. AI active schedule ── */}
            <Section title="AI active schedule" icon="📅">
              <Row
                label="Currently"
                value={
                  <StatusPill
                    state={data.aiActiveNow ? "good" : "warn"}
                    label={data.aiActiveNow ? "Active now" : "Idle (gated)"}
                  />
                }
              />
              <Row
                label="Active days"
                value={describeDays()}
                hint={config.ai_active_days.length < 7 ? "บางวันถูก gate" : undefined}
              />
              <Row
                label="Hour windows (BKK)"
                value={describeWindows()}
              />
              <Row
                label="Queued signals"
                value={
                  <span className={data.queuedCount > 0 ? "text-sig-info" : "text-ink-muted"}>
                    {data.queuedCount}
                  </span>
                }
                hint={data.queuedCount > 0 ? "รอ admin สั่ง process" : undefined}
              />
            </Section>

            {/* ── 4b. Active trading plans (Phase 1b) ── */}
            <Section title="Active trading plans" icon="📡">
              <Row
                label="Accepted"
                value={
                  config.active_trading_plans.length === 0 ? (
                    <StatusPill state="bad" label="ALL DISABLED (kill switch)" />
                  ) : (
                    <span className="text-ink-primary">
                      {config.active_trading_plans
                        .map((p) => (p === "swing" ? "🔵 Swing (1H)" : "🟣 Intraday (15m)"))
                        .join(" + ")}
                    </span>
                  )
                }
                hint="สัญญาณจาก plan ที่ปิดอยู่จะถูก reject ที่ webhook ทันที"
              />
              <Row
                label="Top 3 Trending alerts"
                value={
                  config.trending_alert_enabled ? (
                    <StatusPill state="good" label="ON" />
                  ) : (
                    <StatusPill state="warn" label="OFF" />
                  )
                }
                hint="ส่ง Telegram เมื่อมีเหรียญใหม่ติด Top 3 hottest 24h"
              />
            </Section>

            {/* ── 5. Filters / Env ── */}
            <Section title="Filters & environment" icon="⚙️">
              <Row
                label="MIN_CONFIDENCE"
                value={`${envFlags.MIN_CONFIDENCE}%`}
                hint="signal ที่ confidence ต่ำกว่านี้ → SKIP_LOW_CONF"
              />
              <Row
                label="BLOCKED_HOURS"
                value={envFlags.BLOCKED_HOURS || "(none)"}
                hint="ชั่วโมง BKK ที่ถูก block (defense-in-depth — Pine ก็ block ด้วย)"
              />
              <Row
                label="NOTRADE_TELEGRAM"
                value={
                  <StatusPill
                    state={envFlags.NOTRADE_TELEGRAM === "0" ? "warn" : "good"}
                    label={envFlags.NOTRADE_TELEGRAM === "0" ? "Off" : "On"}
                  />
                }
                hint="NO_TRADE heartbeat ส่ง Telegram หรือไม่"
              />
              <Row
                label="Card retention"
                value={`${config.card_retention_days} days`}
                hint="auto-archive cards เก่ากว่านี้ (DB ยังเก็บ)"
              />
            </Section>

            {/* ── 6. Connections ── */}
            <Section title="Connections" icon="🔌">
              <Row
                label="Telegram contacts"
                value={
                  <StatusPill
                    state={data.telegramContactCount > 0 ? "good" : "warn"}
                    label={`${data.telegramContactCount} active`}
                  />
                }
                hint="จำนวน user ที่เชื่อม Telegram"
              />
            </Section>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="btn btn-primary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
