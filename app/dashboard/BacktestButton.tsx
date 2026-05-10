"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runBacktest } from "./actions";

export default function BacktestButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  const run = async (mode: "new" | "all") => {
    setStatus("Running…");
    start(async () => {
      const data = await runBacktest(mode);
      if (!data.ok) {
        setStatus(`Error: ${data.error ?? "unknown"}`);
        return;
      }
      if (data.skipped) {
        setStatus(`Skipped: ${data.reason ?? "schedule paused"}`);
        return;
      }
      setStatus(
        `Evaluated ${data.evaluated ?? 0} · ${data.win ?? 0}W / ${data.loss ?? 0}L / ${data.open ?? 0}O · win-rate ${
          data.win_rate_pct ?? "-"
        }%`
      );
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <button onClick={() => run("new")} disabled={pending} className="btn btn-primary">
          {pending ? "Refreshing…" : "Run backtest"}
        </button>
        <button onClick={() => run("all")} disabled={pending} className="btn btn-secondary">
          Re-evaluate all
        </button>
      </div>
      {status && <p className="text-[11px] text-ink-muted">{status}</p>}
    </div>
  );
}
