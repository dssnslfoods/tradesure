"use client";

import { useState, useTransition } from "react";
import {
  setEnabled,
  setIntervalMinutes,
  setCardRetentionDays,
  setAiActiveWindows,
  setAiActiveDays,
  setAiModel,
  processQueuedSignals,
  triggerRunNow,
} from "./actions";
import {
  isWithinAiSchedule,
  type AiWindow,
  type BacktestScheduleConfig,
} from "@/lib/schedule/settings";
import { AI_MODELS, findModel, DEFAULT_AI_MODEL } from "@/lib/ai/models";
import Icon from "@/components/ui/Icon";

const DAY_LABELS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function describeWindows(windows: AiWindow[]): string {
  if (windows.length === 0) return "ทำงาน 24 ชั่วโมง (ไม่จำกัดเวลา)";
  return windows
    .map((w) => {
      const s = `${String(w.start).padStart(2, "0")}:00`;
      const e = `${String(w.end).padStart(2, "0")}:00`;
      if (w.start === w.end) return "24ชม.";
      if (w.start > w.end) return `${s}–${e} (ข้ามคืน)`;
      return `${s}–${e}`;
    })
    .join(" + ");
}

export default function ScheduleControls({
  config,
  queuedCount,
}: {
  config: BacktestScheduleConfig;
  queuedCount: number;
}) {
  const [pending, start] = useTransition();
  const [interval, setIntervalState] = useState(config.interval_minutes);
  const [retention, setRetention] = useState(config.card_retention_days);
  const [model, setModel] = useState(config.ai_model || DEFAULT_AI_MODEL);
  const [windows, setWindows] = useState<AiWindow[]>(
    config.ai_active_windows.length > 0
      ? config.ai_active_windows
      : config.ai_active_hours_start === 0 && config.ai_active_hours_end === 0
      ? []
      : [{ start: config.ai_active_hours_start, end: config.ai_active_hours_end }]
  );
  const [days, setDays] = useState<number[]>(config.ai_active_days);
  const [reason, setReason] = useState(config.paused_reason ?? "");
  const [msg, setMsg] = useState<string | null>(null);

  const currentlyActive = isWithinAiSchedule(
    config.ai_active_windows,
    config.ai_active_days
  );
  const windowsChanged =
    JSON.stringify(windows) !== JSON.stringify(config.ai_active_windows);
  const daysChanged =
    JSON.stringify([...days].sort()) !==
    JSON.stringify([...config.ai_active_days].sort());

  const toggleDay = (d: number) => {
    setDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)
    );
  };
  const addWindow = () => setWindows((w) => [...w, { start: 0, end: 0 }]);
  const removeWindow = (i: number) => setWindows((w) => w.filter((_, idx) => idx !== i));
  const updateWindow = (i: number, patch: Partial<AiWindow>) =>
    setWindows((w) => w.map((win, idx) => (idx === i ? { ...win, ...patch } : win)));

  const safeRun = (fn: () => Promise<unknown>) =>
    start(async () => {
      try {
        setMsg(null);
        await fn();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Action failed");
      }
    });

  return (
    <div className="space-y-4">
      {/* Enable / Pause */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <div className="flex items-center gap-2">
            <span className={`pulse-dot ${config.enabled ? "" : "!bg-sig-sell"}`} />
            <span className="text-[14px] font-semibold text-ink-primary">
              {config.enabled ? "Active" : "Paused"}
            </span>
          </div>
          {!config.enabled && config.paused_reason && (
            <p className="mt-1 text-[11px] text-ink-muted">
              Reason: <span className="text-ink-secondary">{config.paused_reason}</span>
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {config.enabled ? (
            <>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Pause reason (optional)"
                className="h-9 rounded-chip border border-white/5 bg-surface-2/60 px-3 text-[13px] text-ink-primary placeholder:text-ink-faint"
              />
              <button
                disabled={pending}
                onClick={() => safeRun(() => setEnabled(false, reason || null))}
                className="btn !bg-sig-sell/15 !text-sig-sell !border-sig-sell/30 hover:!bg-sig-sell/25 disabled:opacity-60"
              >
                <Icon name="pause" size={12} />
                Pause
              </button>
            </>
          ) : (
            <button
              disabled={pending}
              onClick={() => safeRun(() => setEnabled(true))}
              className="btn btn-primary disabled:opacity-60"
            >
              <Icon name="play" size={12} />
              Resume
            </button>
          )}
        </div>
      </div>

      {/* Interval */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <div className="text-[14px] font-semibold text-ink-primary">Display interval</div>
          <p className="mt-1 text-[11px] text-ink-muted">
            ตัวเลขนี้เป็นเพียงข้อมูลแสดง — ความถี่จริงตั้งจาก Cloud Scheduler
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={1440}
            value={interval}
            onChange={(e) => setIntervalState(Number(e.target.value))}
            className="h-9 w-20 rounded-chip border border-white/5 bg-surface-2/60 px-3 font-mono text-[13px] tabular text-ink-primary"
          />
          <span className="text-[12px] text-ink-muted">min</span>
          <button
            disabled={pending || interval === config.interval_minutes}
            onClick={() => safeRun(() => setIntervalMinutes(interval))}
            className="btn btn-secondary disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>

      {/* Card retention */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <div className="text-[14px] font-semibold text-ink-primary">Card retention</div>
          <p className="mt-1 max-w-md text-[11px] text-ink-muted">
            Hide trade cards from the dashboard once they reach a terminal outcome
            (WIN / LOSS / SKIP / NO_TRADE) and are older than N days.
            <span className="text-ink-secondary"> ข้อมูลในฐานข้อมูลยังเก็บครบ</span>{" "}
            — สถิติและ analytics ใช้ข้อมูลเต็มเสมอ. ตั้ง <span className="font-mono text-brand">0</span> = ไม่ archive
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={3650}
            value={retention}
            onChange={(e) => setRetention(Number(e.target.value))}
            className="h-9 w-20 rounded-chip border border-white/5 bg-surface-2/60 px-3 font-mono text-[13px] tabular text-ink-primary"
          />
          <span className="text-[12px] text-ink-muted">days</span>
          <button
            disabled={pending || retention === config.card_retention_days}
            onClick={() => safeRun(() => setCardRetentionDays(retention))}
            className="btn btn-secondary disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>

      {/* AI model picker */}
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Icon name="robot" size={14} className="text-sig-violet" />
              <span className="text-[14px] font-semibold text-ink-primary">
                AI model
              </span>
              {(() => {
                const m = findModel(model);
                return m ? (
                  <span
                    className={`chip !text-[10px] ${
                      m.provider === "gemini" ? "chip-info" : "chip-buy"
                    }`}
                  >
                    {m.provider === "gemini" ? "Google" : "OpenAI"}
                  </span>
                ) : null;
              })()}
            </div>
            <p className="mt-1 max-w-xl text-[11px] text-ink-muted">
              เลือก AI provider + version ที่จะใช้วิเคราะห์ webhook. การเปลี่ยนมีผล{" "}
              <span className="text-ink-secondary">ทันทีกับ signal ถัดไป</span>.
              ต้องตั้ง env <code className="font-mono text-brand">OPENAI_API_KEY</code> หรือ{" "}
              <code className="font-mono text-brand">GEMINI_API_KEY</code> ให้ตรงกับ provider ที่เลือก.
            </p>
            {(() => {
              const m = findModel(model);
              if (!m?.description) return null;
              return (
                <p className="mt-2 text-[12px] text-ink-secondary">
                  รุ่นปัจจุบัน:{" "}
                  <span className="font-mono text-ink-primary">{m.label}</span>{" "}
                  — {m.description}
                </p>
              );
            })()}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="h-9 min-w-[240px] rounded-chip border border-white/5 bg-surface-2/60 px-3 font-mono text-[13px] text-ink-primary"
            >
              <optgroup label="OpenAI (GPT)">
                {AI_MODELS.filter((m) => m.provider === "openai").map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                    {m.recommended ? " ⭐" : ""}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Google Gemini">
                {AI_MODELS.filter((m) => m.provider === "gemini").map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                    {m.recommended ? " ⭐" : ""}
                  </option>
                ))}
              </optgroup>
            </select>
            <button
              disabled={pending || model === (config.ai_model || DEFAULT_AI_MODEL)}
              onClick={() => safeRun(() => setAiModel(model))}
              className="btn btn-secondary disabled:opacity-50"
            >
              Save model
            </button>
          </div>
        </div>
      </div>

      {/* AI active schedule (multi-window + day-of-week) */}
      <div className="card space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Icon name="robot" size={14} className="text-sig-violet" />
              <span className="text-[14px] font-semibold text-ink-primary">
                AI active schedule
              </span>
              <span
                className={`chip !text-[10px] ${
                  currentlyActive ? "chip-buy" : "chip-warn"
                }`}
              >
                <span
                  className={`pulse-dot ${currentlyActive ? "" : "!bg-sig-warn"}`}
                />
                {currentlyActive ? "Active now" : "Idle now"}
              </span>
            </div>
            <p className="mt-1 max-w-xl text-[11px] text-ink-muted">
              นอกช่วงเวลา/วันที่ตั้ง webhook BUY/SELL จะถูก{" "}
              <span className="text-ink-secondary">เก็บเป็น Queue</span> รอ admin วิเคราะห์ทีหลัง —
              ไม่มี Telegram, ประหยัด API cost. NO_TRADE heartbeat ยังส่งปกติ. ไม่มี window = ทำงาน 24 ชม.
            </p>
            <p className="mt-2 text-[12px] text-ink-secondary">
              สถานะ: <span className="font-mono text-ink-primary">{describeWindows(config.ai_active_windows)}</span>
              {" · "}
              <span className="font-mono text-ink-primary">
                {config.ai_active_days.length === 7
                  ? "ทุกวัน"
                  : config.ai_active_days.map((d) => DAY_NAMES[d]).join(", ")}
              </span>
            </p>
          </div>
        </div>

        {/* Day picker */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-eyebrow text-ink-muted">
            Active days:
          </span>
          {DAY_LABELS.map((label, i) => {
            const active = days.includes(i);
            return (
              <button
                key={i}
                type="button"
                onClick={() => toggleDay(i)}
                className={`h-8 min-w-[36px] rounded-chip border px-2 text-[12px] font-semibold transition ${
                  active
                    ? "border-brand/40 bg-brand/15 text-brand"
                    : "border-white/5 bg-surface-2/60 text-ink-muted hover:text-ink-primary"
                }`}
              >
                {label}
              </button>
            );
          })}
          <button
            disabled={pending || !daysChanged}
            onClick={() => safeRun(() => setAiActiveDays(days))}
            className="btn btn-secondary disabled:opacity-50"
          >
            Save days
          </button>
        </div>

        {/* Window list */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-eyebrow text-ink-muted">
              Active hour windows
            </span>
            <button
              type="button"
              onClick={addWindow}
              disabled={windows.length >= 8}
              className="chip chip-info !text-[10px] disabled:opacity-40"
            >
              <Icon name="plus" size={10} />
              Add window
            </button>
          </div>

          {windows.length === 0 ? (
            <div className="rounded-chip border border-white/5 bg-surface-2/60 px-3 py-3 text-center text-[12px] text-ink-muted">
              ไม่มี window — AI ทำงานตลอด 24 ชั่วโมง (เมื่ออยู่ในวันที่กำหนด)
            </div>
          ) : (
            windows.map((w, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center gap-2 rounded-chip border border-white/5 bg-surface-2/40 px-3 py-2"
              >
                <span className="font-mono text-[11px] text-ink-muted">#{i + 1}</span>
                <select
                  value={w.start}
                  onChange={(e) => updateWindow(i, { start: Number(e.target.value) })}
                  className="h-8 rounded-chip border border-white/5 bg-surface-1 px-2 font-mono text-[12px] text-ink-primary"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                  ))}
                </select>
                <span className="text-[11px] text-ink-muted">→</span>
                <select
                  value={w.end}
                  onChange={(e) => updateWindow(i, { end: Number(e.target.value) })}
                  className="h-8 rounded-chip border border-white/5 bg-surface-1 px-2 font-mono text-[12px] text-ink-primary"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                  ))}
                </select>
                {w.start === w.end ? (
                  <span className="text-[11px] text-sig-info">= 24h</span>
                ) : w.start > w.end ? (
                  <span className="text-[11px] text-sig-warn">ข้ามคืน</span>
                ) : null}
                <button
                  type="button"
                  onClick={() => removeWindow(i)}
                  className="ml-auto rounded border border-sig-sell/30 bg-sig-sell/10 p-1 text-sig-sell hover:bg-sig-sell/20"
                  aria-label="Remove window"
                >
                  <Icon name="x" size={11} />
                </button>
              </div>
            ))
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              disabled={pending || !windowsChanged}
              onClick={() => safeRun(() => setAiActiveWindows(windows))}
              className="btn btn-secondary disabled:opacity-50"
            >
              Save windows
            </button>
          </div>
        </div>

        {/* Process queued */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-3">
          <div>
            <div className="text-[13px] font-semibold text-ink-primary">
              Queued signals
              {queuedCount > 0 && (
                <span className="ml-2 inline-flex h-5 min-w-[22px] items-center justify-center rounded-full bg-sig-info/15 px-1.5 text-[10px] font-bold text-sig-info">
                  {queuedCount}
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-ink-muted">
              {queuedCount === 0
                ? "ไม่มี webhook ที่รอวิเคราะห์ในขณะนี้"
                : `webhook ${queuedCount} รายการกำลังรอ AI วิเคราะห์ (เก็บไว้ตอน AI หลับ) — กดเพื่อ batch process`}
            </p>
          </div>
          <button
            disabled={pending || queuedCount === 0}
            onClick={() =>
              safeRun(async () => {
                const data = (await processQueuedSignals()) as {
                  ok?: boolean;
                  processed?: number;
                  filtered?: number;
                  telegrams_sent?: number;
                  errors?: number;
                  error?: string;
                };
                if (data?.ok === false) {
                  setMsg(`Error: ${data.error}`);
                } else {
                  setMsg(
                    `Processed ${data?.processed ?? 0} · filtered ${data?.filtered ?? 0} · sent ${data?.telegrams_sent ?? 0} Telegram · ${data?.errors ?? 0} errors`
                  );
                }
              })
            }
            className="btn btn-primary disabled:opacity-50"
          >
            <Icon name="lightning" size={14} />
            {pending ? "Processing…" : `Process queue${queuedCount > 0 ? ` (${queuedCount})` : ""}`}
          </button>
        </div>
      </div>

      {/* Run now */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <div className="text-[14px] font-semibold text-ink-primary">Manual trigger</div>
          <p className="mt-1 text-[11px] text-ink-muted">
            กดเพื่อรัน backtest ทันที (จะ override pause flag)
          </p>
        </div>
        <button
          disabled={pending}
          onClick={() =>
            safeRun(async () => {
              const data = (await triggerRunNow()) as {
                ok?: boolean;
                evaluated?: number;
                win?: number;
                loss?: number;
                open?: number;
                win_rate_pct?: number | null;
                error?: string;
              };
              if (data?.ok === false) {
                setMsg(`Error: ${data.error}`);
              } else {
                setMsg(
                  `Ran: evaluated ${data?.evaluated ?? 0} · ${data?.win ?? 0}W / ${
                    data?.loss ?? 0
                  }L / ${data?.open ?? 0}O · win-rate ${data?.win_rate_pct ?? "-"}%`
                );
              }
            })
          }
          className="btn btn-primary disabled:opacity-60"
        >
          <Icon name="lightning" size={14} />
          {pending ? "Running…" : "Run backtest now"}
        </button>
      </div>

      {msg && (
        <p className="rounded-chip border border-white/5 bg-surface-1 px-3 py-2 text-[12px] text-ink-secondary">
          {msg}
        </p>
      )}
    </div>
  );
}
