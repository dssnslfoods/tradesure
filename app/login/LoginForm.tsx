"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Icon from "@/components/ui/Icon";

type Step = "username" | "code";
const OTP_LEN = 4; // matches backend OTP_LENGTH

export default function LoginForm({ next }: { next?: string }) {
  const [pending, start] = useTransition();
  const [step, setStep] = useState<Step>("username");
  const [username, setUsername] = useState("");
  const [otp, setOtp] = useState<string[]>(Array(OTP_LEN).fill(""));
  const [info, setInfo] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (step === "code" && inputsRef.current[0]) inputsRef.current[0]?.focus();
  }, [step]);

  const requestCode = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!username.trim()) {
      setErr("กรุณากรอก username");
      return;
    }
    setErr(null);
    setInfo(null);
    start(async () => {
      try {
        const res = await fetch("/api/auth/request-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: username.trim() }),
          cache: "no-store",
        });
        const data = (await res.json()) as {
          ok: boolean;
          error?: string;
          sent?: boolean;
          expires_in_minutes?: number;
        };
        if (!res.ok || !data.ok) {
          setErr(data.error ?? "ส่งรหัสไม่สำเร็จ");
          return;
        }
        setInfo(
          data.sent
            ? `📤 ส่งรหัส ${OTP_LEN} หลักไปยัง Telegram (หมดอายุใน ${data.expires_in_minutes ?? 5} นาที)`
            : "ถ้า username นี้มีอยู่ในระบบ รหัสจะถูกส่งไปที่ Telegram"
        );
        setStep("code");
        setOtp(Array(OTP_LEN).fill(""));
        setSecondsLeft(60);
        const t = setInterval(() => {
          setSecondsLeft((s) => {
            if (s <= 1) {
              clearInterval(t);
              return 0;
            }
            return s - 1;
          });
        }, 1000);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Network error");
      }
    });
  };

  const submitOtp = (code: string) => {
    if (code.length !== OTP_LEN) return;
    setErr(null);
    start(async () => {
      try {
        const res = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: username.trim(), code }),
          cache: "no-store",
        });
        const data = (await res.json()) as { ok: boolean; error?: string };
        if (!res.ok || !data.ok) {
          setErr(data.error ?? "รหัสไม่ถูกต้อง");
          return;
        }
        window.location.href = next ?? "/dashboard";
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Network error");
      }
    });
  };

  const onOtpChange = (idx: number, val: string) => {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[idx] = digit;
    setOtp(next);
    if (digit && idx < OTP_LEN - 1) {
      inputsRef.current[idx + 1]?.focus();
    }
    if (digit && idx === OTP_LEN - 1) {
      const code = next.join("");
      if (code.length === OTP_LEN) submitOtp(code);
    }
  };

  const onOtpKey = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otp[idx] && idx > 0) {
      inputsRef.current[idx - 1]?.focus();
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LEN);
    if (text.length === 0) return;
    e.preventDefault();
    const next = Array(OTP_LEN).fill("");
    for (let i = 0; i < text.length; i++) next[i] = text[i];
    setOtp(next);
    if (text.length === OTP_LEN) submitOtp(text);
    else inputsRef.current[Math.min(text.length, OTP_LEN - 1)]?.focus();
  };

  return (
    <div className="glass relative w-[420px] max-w-full rounded-hero p-7">
      {step === "username" && (
        <form onSubmit={requestCode} className="space-y-5">
          <div>
            <div className="eyebrow !text-[10px]">Step 1 of 2</div>
            <h2 className="mt-1 text-[22px] font-bold tracking-tightest text-ink-primary">
              Sign in
            </h2>
            <p className="mt-1 text-[12px] text-ink-secondary">
              เข้าสู่ระบบด้วยรหัส OTP ที่ส่งผ่าน Telegram
            </p>
          </div>

          <label className="block">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-eyebrow text-ink-muted">
              Username
            </div>
            <div className="relative flex items-center">
              <Icon
                name="users"
                size={16}
                className="absolute left-3 text-ink-muted"
              />
              <input
                type="text"
                autoComplete="username"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="h-11 w-full rounded-chip border border-white/5 bg-surface-2/60 pl-10 pr-3 text-[14px] text-ink-primary placeholder:text-ink-faint focus:border-brand/40"
                disabled={pending}
              />
            </div>
          </label>

          <button
            type="submit"
            disabled={pending || !username.trim()}
            className="btn btn-primary w-full justify-center !py-3 !text-[14px] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon name="send" size={16} />
            {pending ? "กำลังส่ง…" : "ส่งรหัสไปที่ Telegram"}
          </button>
        </form>
      )}

      {step === "code" && (
        <div className="space-y-5">
          <div>
            <div className="eyebrow !text-[10px]">Step 2 of 2</div>
            <h2 className="mt-1 text-[22px] font-bold tracking-tightest text-ink-primary">
              ใส่รหัสจาก Telegram
            </h2>
            <p className="mt-1 text-[12px] text-ink-secondary">
              ส่งให้{" "}
              <span className="font-semibold text-ink-primary">{username}</span>{" "}
              <button
                type="button"
                onClick={() => {
                  setStep("username");
                  setOtp(Array(OTP_LEN).fill(""));
                  setErr(null);
                  setInfo(null);
                }}
                className="text-brand underline-offset-2 hover:underline"
              >
                เปลี่ยน
              </button>
            </p>
          </div>

          <div className="flex justify-center gap-3" onPaste={onPaste}>
            {otp.map((d, i) => (
              <input
                key={i}
                ref={(el) => { inputsRef.current[i] = el; }}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={d}
                onChange={(e) => onOtpChange(i, e.target.value)}
                onKeyDown={(e) => onOtpKey(i, e)}
                disabled={pending}
                className="h-14 w-12 rounded-chip border border-white/5 bg-surface-2/60 text-center font-mono text-[24px] font-bold text-ink-primary tabular focus:border-brand/40"
                aria-label={`Digit ${i + 1}`}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => requestCode()}
            disabled={pending || secondsLeft > 0}
            className="btn btn-ghost w-full justify-center disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon name="refresh" size={14} />
            {secondsLeft > 0 ? `ส่งใหม่อีกครั้งใน ${secondsLeft}s` : "ส่งใหม่อีกครั้ง"}
          </button>
        </div>
      )}

      {info && (
        <p className="mt-4 flex items-start gap-2 rounded-chip border border-sig-buy/30 bg-sig-buy/10 px-3 py-2 text-[11px] text-sig-buy">
          <Icon name="circle-check" size={14} className="mt-0.5" />
          {info}
        </p>
      )}
      {err && (
        <p className="mt-4 flex items-start gap-2 rounded-chip border border-sig-sell/30 bg-sig-sell/10 px-3 py-2 text-[11px] text-sig-sell">
          <Icon name="alert-triangle" size={14} className="mt-0.5" />
          {err}
        </p>
      )}

      <div className="mt-5 flex items-center justify-center gap-2 rounded-chip bg-surface-2/40 px-3 py-2 text-[10px] text-ink-muted">
        <Icon name="shield-check" size={12} className="text-brand" />
        <span>
          เข้ารหัสแบบ end-to-end · OTP หมดอายุใน 5 นาที · ขอใหม่ได้ {3} ครั้งใน 10 นาที
        </span>
      </div>
    </div>
  );
}
