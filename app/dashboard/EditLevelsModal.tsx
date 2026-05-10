"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSignalLevels } from "./actions";

interface InitialLevels {
  analysisId: string;
  symbol: string;
  bias: string | null;
  entry_low: number | null;
  entry_high: number | null;
  stop_loss_num: number | null;
  take_profit_1_num: number | null;
  take_profit_2_num: number | null;
}

export default function EditLevelsModal({
  open,
  onClose,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  initial: InitialLevels | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [entryLow, setEntryLow] = useState("");
  const [entryHigh, setEntryHigh] = useState("");
  const [sl, setSl] = useState("");
  const [tp1, setTp1] = useState("");
  const [tp2, setTp2] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (initial) {
      setEntryLow(initial.entry_low?.toString() ?? "");
      setEntryHigh(initial.entry_high?.toString() ?? "");
      setSl(initial.stop_loss_num?.toString() ?? "");
      setTp1(initial.take_profit_1_num?.toString() ?? "");
      setTp2(initial.take_profit_2_num?.toString() ?? "");
      setErr(null);
    }
  }, [initial]);

  if (!open || !initial) return null;

  const parse = (s: string): number | null => {
    if (!s.trim()) return null;
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const onSave = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const slN = parse(sl);
    const tp1N = parse(tp1);
    const tp2N = parse(tp2);
    if (slN === null || tp1N === null || tp2N === null) {
      setErr("กรุณากรอก SL, TP1, TP2 เป็นตัวเลขมากกว่า 0");
      return;
    }
    // Optional sanity check by bias
    if (initial.bias === "LONG") {
      if (!(slN < tp1N && tp1N < tp2N)) {
        setErr("LONG: ต้องเป็น SL < TP1 < TP2");
        return;
      }
    } else if (initial.bias === "SHORT") {
      if (!(slN > tp1N && tp1N > tp2N)) {
        setErr("SHORT: ต้องเป็น SL > TP1 > TP2");
        return;
      }
    }
    startTransition(async () => {
      const res = await updateSignalLevels(initial.analysisId, {
        entry_low: parse(entryLow),
        entry_high: parse(entryHigh),
        stop_loss_num: slN,
        take_profit_1_num: tp1N,
        take_profit_2_num: tp2N,
      });
      if (!res.ok) {
        setErr(res.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      onClose();
      router.refresh();
    });
  };

  // Compute live R:R and % from entry mid for visual feedback
  const slN = parse(sl);
  const tp1N = parse(tp1);
  const tp2N = parse(tp2);
  const entryMidN =
    parse(entryLow) !== null && parse(entryHigh) !== null
      ? (parse(entryLow)! + parse(entryHigh)!) / 2
      : null;

  const rrTp1 =
    entryMidN && slN && tp1N
      ? Math.abs(tp1N - entryMidN) / Math.abs(entryMidN - slN)
      : null;
  const rrTp2 =
    entryMidN && slN && tp2N
      ? Math.abs(tp2N - entryMidN) / Math.abs(entryMidN - slN)
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-crypto-border bg-crypto-panel p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold">แก้ไขระดับราคา</h2>
            <p className="text-xs text-slate-400">
              {initial.symbol} ·{" "}
              <span
                className={
                  initial.bias === "LONG"
                    ? "text-emerald-300"
                    : initial.bias === "SHORT"
                    ? "text-rose-300"
                    : "text-slate-300"
                }
              >
                {initial.bias ?? "-"}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form onSubmit={onSave} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Entry low" value={entryLow} onChange={setEntryLow} placeholder="optional" />
            <Field label="Entry high" value={entryHigh} onChange={setEntryHigh} placeholder="optional" />
          </div>
          <Field label="🛑 Stop Loss" value={sl} onChange={setSl} required tone="rose" />
          <Field label="✅ Take Profit 1" value={tp1} onChange={setTp1} required tone="emerald" />
          <Field label="✅ Take Profit 2" value={tp2} onChange={setTp2} required tone="emerald" />

          {(rrTp1 !== null || rrTp2 !== null) && (
            <div className="rounded-md border border-crypto-border bg-black/30 p-3 text-xs">
              <div className="mb-1 font-semibold text-slate-300">Live preview</div>
              {rrTp1 !== null && (
                <div className="flex justify-between text-slate-400">
                  <span>R:R (TP1):</span>
                  <span className={rrTp1 >= 1.5 ? "text-emerald-300" : "text-amber-300"}>
                    {rrTp1.toFixed(2)}:1
                  </span>
                </div>
              )}
              {rrTp2 !== null && (
                <div className="flex justify-between text-slate-400">
                  <span>R:R (TP2):</span>
                  <span className={rrTp2 >= 2 ? "text-emerald-300" : "text-amber-300"}>
                    {rrTp2.toFixed(2)}:1
                  </span>
                </div>
              )}
            </div>
          )}

          {err && (
            <p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {err}
            </p>
          )}

          <p className="text-xs text-slate-500">
            ⚠️ การบันทึกจะ reset outcome เป็น PENDING — รอบ backtest ถัดไปจะคำนวณใหม่ด้วยค่านี้
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded-lg border border-crypto-border bg-black/30 px-4 py-2 text-sm text-slate-300 hover:bg-black/50 disabled:opacity-40"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-crypto-accent px-4 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-40"
            >
              {pending ? "กำลังบันทึก…" : "💾 บันทึก"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  tone,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  tone?: "rose" | "emerald";
}) {
  const accent =
    tone === "rose"
      ? "focus:border-rose-500"
      : tone === "emerald"
      ? "focus:border-emerald-500"
      : "focus:border-crypto-accent";
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-400">
        {label} {required ? <span className="text-rose-400">*</span> : null}
      </label>
      <input
        type="number"
        step="any"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-lg border border-crypto-border bg-black/40 px-3 py-2 tabular-nums text-slate-100 placeholder-slate-600 focus:outline-none ${accent}`}
      />
    </div>
  );
}
