"use client";

import { useState, useTransition } from "react";
import {
  setEnabled,
  setIntervalMinutes,
  setCardRetentionDays,
  setAiActiveHours,
  triggerRunNow,
} from "./actions";
import { isWithinAiHours, type BacktestScheduleConfig } from "@/lib/schedule/settings";
import Icon from "@/components/ui/Icon";

export default function ScheduleControls({ config }: { config: BacktestScheduleConfig }) {
  const [pending, start] = useTransition();
  const [interval, setIntervalState] = useState(config.interval_minutes);
  const [retention, setRetention] = useState(config.card_retention_days);
  const [aiStart, setAiStart] = useState(config.ai_active_hours_start);
  const [aiEnd, setAiEnd] = useState(config.ai_active_hours_end);
  const [reason, setReason] = useState(config.paused_reason ?? "");
  const [msg, setMsg] = useState<string | null>(null);

  const aiWindowChanged =
    aiStart !== config.ai_active_hours_start || aiEnd !== config.ai_active_hours_end;
  const aiWindowDescription =
    aiStart === aiEnd
      ? "ทำงาน 24 ชั่วโมง (ไม่จำกัดเวลา)"
      : aiStart < aiEnd
      ? `ทำงานช่วง ${String(aiStart).padStart(2, "0")}:00 – ${String(aiEnd).padStart(2, "0")}:00 BKK`
      : `ทำงานช่วง ${String(aiStart).padStart(2, "0")}:00 – ${String(aiEnd).padStart(2, "0")}:00 BKK (ข้ามคืน)`;
  const currentlyInWindow = isWithinAiHours(
    config.ai_active_hours_start,
    config.ai_active_hours_end
  );

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

      {/* AI active hours */}
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Icon name="robot" size={14} className="text-sig-violet" />
              <span className="text-[14px] font-semibold text-ink-primary">
                AI active hours
              </span>
              <span
                className={`chip !text-[10px] ${
                  currentlyInWindow ? "chip-buy" : "chip-warn"
                }`}
              >
                <span
                  className={`pulse-dot ${currentlyInWindow ? "" : "!bg-sig-warn"}`}
                />
                {currentlyInWindow ? "Active now" : "Idle now"}
              </span>
            </div>
            <p className="mt-1 max-w-md text-[11px] text-ink-muted">
              นอกช่วงเวลานี้ webhook BUY/SELL จะ <span className="text-ink-secondary">ไม่ถูกวิเคราะห์โดย AI</span> —
              ไม่มี card, ไม่ส่ง Telegram, ประหยัด API cost.
              {" "}NO_TRADE heartbeat ยังส่งตามปกติ. ตั้ง start == end (เช่น 0/0) = ทำงาน 24 ชม.
            </p>
            <p className="mt-2 text-[12px] text-ink-secondary">
              ปัจจุบัน: <span className="font-mono text-ink-primary">{aiWindowDescription}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={aiStart}
              onChange={(e) => setAiStart(Number(e.target.value))}
              className="h-9 rounded-chip border border-white/5 bg-surface-2/60 px-2 font-mono text-[13px] text-ink-primary"
              aria-label="AI active hour start"
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>
              ))}
            </select>
            <span className="text-[12px] text-ink-muted">→</span>
            <select
              value={aiEnd}
              onChange={(e) => setAiEnd(Number(e.target.value))}
              className="h-9 rounded-chip border border-white/5 bg-surface-2/60 px-2 font-mono text-[13px] text-ink-primary"
              aria-label="AI active hour end"
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>
              ))}
            </select>
            <button
              disabled={pending || !aiWindowChanged}
              onClick={() => safeRun(() => setAiActiveHours(aiStart, aiEnd))}
              className="btn btn-secondary disabled:opacity-50"
            >
              Save
            </button>
          </div>
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
