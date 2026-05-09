"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function BacktestButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  const run = async (mode: "new" | "all") => {
    setStatus("Running…");
    try {
      const url = mode === "all" ? "/api/backtest/run?reeval=1&limit=500" : "/api/backtest/run?limit=500";
      const res = await fetch(url, { method: "POST", cache: "no-store" });
      const data = (await res.json()) as {
        ok: boolean;
        evaluated?: number;
        win?: number;
        loss?: number;
        open?: number;
        win_rate_pct?: number | null;
        error?: string;
      };
      if (!data.ok) {
        setStatus(`Error: ${data.error ?? "unknown"}`);
        return;
      }
      setStatus(
        `Evaluated ${data.evaluated} · ${data.win}W / ${data.loss}L / ${data.open}O · win-rate ${
          data.win_rate_pct ?? "-"
        }%`
      );
      start(() => router.refresh());
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Network error");
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <button
          onClick={() => run("new")}
          disabled={pending}
          className="rounded-lg bg-crypto-accent px-4 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Refreshing…" : "Run backtest (new)"}
        </button>
        <button
          onClick={() => run("all")}
          disabled={pending}
          className="rounded-lg border border-crypto-border bg-crypto-panel px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-black/30 disabled:opacity-60"
        >
          Re-evaluate all
        </button>
      </div>
      {status && <p className="text-xs text-slate-400">{status}</p>}
    </div>
  );
}
