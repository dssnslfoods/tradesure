"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Step = "username" | "code";

export default function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<Step>("username");
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [info, setInfo] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const requestCode = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setInfo(null);
    if (!username.trim()) {
      setErr("กรุณากรอก username");
      return;
    }
    startTransition(async () => {
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
            ? `📤 ส่งรหัส 4 หลักไปยัง Telegram ของคุณแล้ว — ตรวจสอบใน 1-2 วินาที (หมดอายุใน ${
                data.expires_in_minutes ?? 5
              } นาที)`
            : "ถ้า username นี้มีอยู่ในระบบ รหัสจะถูกส่งไปที่ Telegram"
        );
        setStep("code");
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

  const verify = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (code.trim().length !== 4) {
      setErr("กรุณากรอกรหัส 4 หลัก");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: username.trim(), code: code.trim() }),
          cache: "no-store",
        });
        const data = (await res.json()) as { ok: boolean; error?: string };
        if (!res.ok || !data.ok) {
          setErr(data.error ?? "รหัสไม่ถูกต้อง");
          return;
        }
        // Hard navigation so middleware sees the new cookie
        window.location.href = next ?? "/dashboard";
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Network error");
      }
    });
  };

  return (
    <div className="rounded-2xl border border-crypto-border bg-crypto-panel p-6 shadow-xl">
      {step === "username" && (
        <form onSubmit={requestCode} className="space-y-4">
          <div>
            <label htmlFor="username" className="mb-1 block text-sm font-medium text-slate-300">
              Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              className="w-full rounded-lg border border-crypto-border bg-black/40 px-3 py-2 text-slate-100 placeholder-slate-600 focus:border-crypto-accent focus:outline-none"
              disabled={pending}
            />
          </div>
          <button
            type="submit"
            disabled={pending || !username.trim()}
            className="w-full rounded-lg bg-crypto-accent px-4 py-2.5 font-semibold text-black hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? "กำลังส่ง…" : "📤 ส่งรหัสไปที่ Telegram"}
          </button>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={verify} className="space-y-4">
          <div className="text-sm text-slate-400">
            User: <span className="font-semibold text-slate-200">{username}</span>{" "}
            <button
              type="button"
              onClick={() => {
                setStep("username");
                setCode("");
                setErr(null);
                setInfo(null);
              }}
              className="ml-2 text-xs text-sky-400 underline hover:text-sky-300"
            >
              เปลี่ยน
            </button>
          </div>
          <div>
            <label htmlFor="code" className="mb-1 block text-sm font-medium text-slate-300">
              รหัส 4 หลักจาก Telegram
            </label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="••••"
              className="w-full rounded-lg border border-crypto-border bg-black/40 px-3 py-3 text-center text-2xl font-bold tracking-[0.5em] tabular-nums text-slate-100 placeholder-slate-700 focus:border-crypto-accent focus:outline-none"
              disabled={pending}
            />
          </div>
          <button
            type="submit"
            disabled={pending || code.length !== 4}
            className="w-full rounded-lg bg-crypto-accent px-4 py-2.5 font-semibold text-black hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? "กำลังตรวจ…" : "✅ ยืนยันรหัส"}
          </button>
          <button
            type="button"
            onClick={requestCode}
            disabled={pending || secondsLeft > 0}
            className="w-full rounded-lg border border-crypto-border bg-black/30 px-4 py-2 text-sm text-slate-300 hover:bg-black/50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {secondsLeft > 0 ? `ขอรหัสใหม่ได้ใน ${secondsLeft}s` : "🔄 ขอรหัสใหม่"}
          </button>
        </form>
      )}

      {info && (
        <p className="mt-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
          {info}
        </p>
      )}
      {err && (
        <p className="mt-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {err}
        </p>
      )}
    </div>
  );
}
