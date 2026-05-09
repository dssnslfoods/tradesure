"use client";

import { useState, useTransition } from "react";
import { setEnabled, setIntervalMinutes, triggerRunNow } from "./actions";
import type { BacktestScheduleConfig } from "@/lib/schedule/settings";

export default function ScheduleControls({ config }: { config: BacktestScheduleConfig }) {
  const [pending, start] = useTransition();
  const [interval, setIntervalState] = useState(config.interval_minutes);
  const [reason, setReason] = useState(config.paused_reason ?? "");
  const [msg, setMsg] = useState<string | null>(null);

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
    <div className="space-y-6">
      {/* Enable / Pause */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-crypto-border bg-crypto-panel p-4">
        <div>
          <div className="text-sm font-semibold">
            Status:{" "}
            {config.enabled ? (
              <span className="text-emerald-400">● Active</span>
            ) : (
              <span className="text-rose-400">● Paused</span>
            )}
          </div>
          {!config.enabled && config.paused_reason && (
            <p className="mt-1 text-xs text-slate-400">
              Reason: {config.paused_reason}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {config.enabled ? (
            <>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Pause reason (optional)"
                className="rounded border border-crypto-border bg-black/40 px-3 py-2 text-sm placeholder-slate-500"
              />
              <button
                disabled={pending}
                onClick={() => safeRun(() => setEnabled(false, reason || null))}
                className="rounded-lg bg-rose-500/20 border border-rose-500/40 px-4 py-2 text-sm font-semibold text-rose-200 hover:bg-rose-500/30 disabled:opacity-60"
              >
                Pause schedule
              </button>
            </>
          ) : (
            <button
              disabled={pending}
              onClick={() => safeRun(() => setEnabled(true))}
              className="rounded-lg bg-emerald-500/20 border border-emerald-500/40 px-4 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-60"
            >
              Resume schedule
            </button>
          )}
        </div>
      </div>

      {/* Interval */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-crypto-border bg-crypto-panel p-4">
        <div>
          <div className="text-sm font-semibold">Display interval</div>
          <p className="mt-1 text-xs text-slate-400">
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
            className="w-20 rounded border border-crypto-border bg-black/40 px-3 py-2 text-sm tabular-nums"
          />
          <span className="text-sm text-slate-400">min</span>
          <button
            disabled={pending || interval === config.interval_minutes}
            onClick={() => safeRun(() => setIntervalMinutes(interval))}
            className="rounded-lg border border-crypto-border bg-crypto-panel px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-black/30 disabled:opacity-60"
          >
            Save
          </button>
        </div>
      </div>

      {/* Run now */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-crypto-border bg-crypto-panel p-4">
        <div>
          <div className="text-sm font-semibold">Manual trigger</div>
          <p className="mt-1 text-xs text-slate-400">
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
                  `✓ Ran: evaluated ${data?.evaluated ?? 0} · ${data?.win ?? 0}W / ${
                    data?.loss ?? 0
                  }L / ${data?.open ?? 0}O · win-rate ${data?.win_rate_pct ?? "-"}%`
                );
              }
            })
          }
          className="rounded-lg bg-crypto-accent px-5 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Running…" : "Run backtest now"}
        </button>
      </div>

      {msg && <p className="text-xs text-slate-300">{msg}</p>}
    </div>
  );
}
