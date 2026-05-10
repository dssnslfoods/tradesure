"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSignalLevels } from "./actions";
import Icon from "@/components/ui/Icon";

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
    if (initial.bias === "LONG" && !(slN < tp1N && tp1N < tp2N)) {
      setErr("LONG: ต้องเป็น SL < TP1 < TP2");
      return;
    }
    if (initial.bias === "SHORT" && !(slN > tp1N && tp1N > tp2N)) {
      setErr("SHORT: ต้องเป็น SL > TP1 > TP2");
      return;
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

  const slN = parse(sl);
  const tp1N = parse(tp1);
  const tp2N = parse(tp2);
  const entryMidN =
    parse(entryLow) !== null && parse(entryHigh) !== null
      ? (parse(entryLow)! + parse(entryHigh)!) / 2
      : null;
  const rrTp1 = entryMidN && slN && tp1N
    ? Math.abs(tp1N - entryMidN) / Math.abs(entryMidN - slN)
    : null;
  const rrTp2 = entryMidN && slN && tp2N
    ? Math.abs(tp2N - entryMidN) / Math.abs(entryMidN - slN)
    : null;

  const biasChip =
    initial.bias === "LONG"
      ? "chip-buy"
      : initial.bias === "SHORT"
      ? "chip-sell"
      : "chip-warn";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="card glass relative w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between">
          <div>
            <div className="eyebrow">Edit signal levels</div>
            <h2 className="mt-1 flex items-center gap-2 text-[18px] font-bold tracking-tightest text-ink-primary">
              {initial.symbol}
              <span className={`chip !text-[10px] !py-0.5 !px-1.5 ${biasChip}`}>
                {initial.bias ?? "-"}
              </span>
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-muted hover:text-ink-primary"
            aria-label="Close"
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        <form onSubmit={onSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Entry low" value={entryLow} onChange={setEntryLow} placeholder="optional" />
            <Field label="Entry high" value={entryHigh} onChange={setEntryHigh} placeholder="optional" />
          </div>
          <Field
            label="Stop Loss"
            value={sl}
            onChange={setSl}
            required
            tone="sell"
            icon="alert-triangle"
          />
          <Field
            label="Take Profit 1"
            value={tp1}
            onChange={setTp1}
            required
            tone="buy"
            icon="target"
          />
          <Field
            label="Take Profit 2"
            value={tp2}
            onChange={setTp2}
            required
            tone="buy"
            icon="target"
          />

          {(rrTp1 !== null || rrTp2 !== null) && (
            <div className="rounded-card border border-white/5 bg-surface-2/40 p-3">
              <div className="mb-1.5 eyebrow !text-[10px]">Live preview</div>
              <div className="grid grid-cols-2 gap-3 text-[12px]">
                {rrTp1 !== null && (
                  <div className="flex items-center justify-between">
                    <span className="text-ink-muted">R:R (TP1)</span>
                    <span
                      className={`font-mono font-semibold tabular ${
                        rrTp1 >= 1.5 ? "text-sig-buy" : "text-sig-warn"
                      }`}
                    >
                      {rrTp1.toFixed(2)}:1
                    </span>
                  </div>
                )}
                {rrTp2 !== null && (
                  <div className="flex items-center justify-between">
                    <span className="text-ink-muted">R:R (TP2)</span>
                    <span
                      className={`font-mono font-semibold tabular ${
                        rrTp2 >= 2 ? "text-sig-buy" : "text-sig-warn"
                      }`}
                    >
                      {rrTp2.toFixed(2)}:1
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {err && (
            <p className="flex items-start gap-2 rounded-chip border border-sig-sell/30 bg-sig-sell/10 px-3 py-2 text-[11px] text-sig-sell">
              <Icon name="alert-triangle" size={12} className="mt-0.5" />
              {err}
            </p>
          )}

          <p className="flex items-start gap-2 text-[11px] text-ink-muted">
            <Icon name="info" size={12} className="mt-0.5" />
            การบันทึกจะ reset outcome เป็น PENDING — backtest รอบถัดไปจะคำนวณใหม่
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} disabled={pending} className="btn btn-ghost">
              ยกเลิก
            </button>
            <button type="submit" disabled={pending} className="btn btn-primary">
              <Icon name="check" size={14} />
              {pending ? "กำลังบันทึก…" : "บันทึก"}
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
  icon,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  tone?: "buy" | "sell";
  icon?: "alert-triangle" | "target";
}) {
  const accent =
    tone === "sell"
      ? "focus:border-sig-sell/60"
      : tone === "buy"
      ? "focus:border-sig-buy/60"
      : "focus:border-brand/40";
  const iconColor =
    tone === "sell" ? "text-sig-sell" : tone === "buy" ? "text-sig-buy" : "";
  return (
    <label className="block">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-eyebrow text-ink-muted">
        {icon && <Icon name={icon} size={11} className={iconColor} />}
        {label}
        {required && <span className="text-sig-sell">*</span>}
      </div>
      <input
        type="number"
        step="any"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`h-10 w-full rounded-chip border border-white/5 bg-surface-2/60 px-3 font-mono tabular text-[13px] text-ink-primary placeholder:text-ink-faint ${accent}`}
      />
    </label>
  );
}
