"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteTelegramWebhook,
  getTelegramWebhookInfo,
  setTelegramWebhook,
  type TelegramWebhookInfo,
} from "./actions";

const EXPECTED_PATH = "/api/telegram/bot";

export default function TelegramWebhookPanel() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [info, setInfo] = useState<TelegramWebhookInfo | null>(null);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    setLoading(true);
    startTransition(async () => {
      const r = await getTelegramWebhookInfo();
      setInfo(r);
      setLoading(false);
    });
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSetup = () => {
    setMsg(null);
    startTransition(async () => {
      const r = await setTelegramWebhook();
      if (r.ok) {
        setMsg({ tone: "success", text: `✅ ผูก webhook สำเร็จ → ${r.url}` });
        const fresh = await getTelegramWebhookInfo();
        setInfo(fresh);
        router.refresh();
      } else {
        setMsg({ tone: "error", text: `❌ ${r.error ?? "failed"}` });
      }
    });
  };

  const onDelete = () => {
    if (!confirm("ยกเลิก webhook? Bot จะไม่รับ message จนกว่าจะ setup ใหม่")) return;
    setMsg(null);
    startTransition(async () => {
      const r = await deleteTelegramWebhook();
      if (r.ok) {
        setMsg({ tone: "success", text: "✅ ยกเลิก webhook แล้ว" });
        const fresh = await getTelegramWebhookInfo();
        setInfo(fresh);
      } else {
        setMsg({ tone: "error", text: `❌ ${r.error ?? "failed"}` });
      }
    });
  };

  const isOk = info?.ok && info.url && info.url.endsWith(EXPECTED_PATH);
  const isOtherUrl = info?.ok && info.url && !info.url.endsWith(EXPECTED_PATH);
  const isUnset = info?.ok && !info.url;

  return (
    <section className="mb-8 rounded-xl border border-crypto-border bg-crypto-panel p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">🤖 Telegram Bot Webhook</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            ระบบจะรับ message จาก Telegram และเก็บ chat ID อัตโนมัติ
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={refresh}
            disabled={pending}
            className="rounded border border-crypto-border bg-black/30 px-3 py-1.5 text-xs text-slate-300 hover:bg-black/50 disabled:opacity-40"
          >
            🔄 Refresh
          </button>
          {(isUnset || isOtherUrl) && (
            <button
              type="button"
              onClick={onSetup}
              disabled={pending}
              className="rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40"
            >
              {pending ? "กำลังตั้งค่า…" : "🔌 Setup webhook"}
            </button>
          )}
          {isOk && (
            <>
              <button
                type="button"
                onClick={onSetup}
                disabled={pending}
                className="rounded border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-300 hover:bg-sky-500/20 disabled:opacity-40"
              >
                {pending ? "…" : "🔄 Re-register"}
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={pending}
                className="rounded border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 disabled:opacity-40"
              >
                {pending ? "…" : "🗑 Delete"}
              </button>
            </>
          )}
        </div>
      </div>

      {loading && (
        <p className="text-xs text-slate-500">กำลังโหลดสถานะ…</p>
      )}

      {!loading && info && (
        <div className="space-y-2 rounded-lg border border-crypto-border bg-black/30 p-3 text-sm">
          <Row label="Status">
            {!info.ok ? (
              <span className="rounded bg-rose-500/20 px-2 py-0.5 text-xs font-semibold text-rose-300">
                ❌ Error
              </span>
            ) : isOk ? (
              <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                ✓ Active
              </span>
            ) : isOtherUrl ? (
              <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-300">
                ⚠️ Wrong URL
              </span>
            ) : (
              <span className="rounded bg-slate-500/20 px-2 py-0.5 text-xs font-semibold text-slate-300">
                ○ Not configured
              </span>
            )}
          </Row>
          {info.error && <Row label="Error">{info.error}</Row>}
          {info.url && (
            <Row label="URL">
              <code className="break-all text-xs text-slate-300">{info.url}</code>
            </Row>
          )}
          {typeof info.pending_update_count === "number" && (
            <Row label="Pending updates">
              <span className="tabular-nums text-slate-300">{info.pending_update_count}</span>
            </Row>
          )}
          {info.ip_address && <Row label="IP">{info.ip_address}</Row>}
          {info.allowed_updates && info.allowed_updates.length > 0 && (
            <Row label="Allowed updates">
              <span className="text-xs text-slate-300">{info.allowed_updates.join(", ")}</span>
            </Row>
          )}
          {info.last_error_date && (
            <>
              <Row label="Last error time">
                <span className="text-rose-300">
                  {new Date(info.last_error_date * 1000).toLocaleString("en-GB", { hour12: false })}
                </span>
              </Row>
              {info.last_error_message && (
                <Row label="Last error">
                  <span className="text-rose-300">{info.last_error_message}</span>
                </Row>
              )}
            </>
          )}
        </div>
      )}

      {msg && (
        <p
          className={`mt-3 rounded-md border px-3 py-2 text-xs ${
            msg.tone === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-rose-500/30 bg-rose-500/10 text-rose-300"
          }`}
        >
          {msg.text}
        </p>
      )}

      {isOk && (
        <details className="mt-3 text-xs text-slate-400">
          <summary className="cursor-pointer hover:text-slate-300">
            📋 วิธีให้ user ใหม่เริ่มใช้งาน
          </summary>
          <ol className="mt-2 list-inside list-decimal space-y-1 pl-2">
            <li>ผู้ใช้ค้นหา bot ใน Telegram และส่งข้อความ <code>/start</code></li>
            <li>Bot ตอบกลับพร้อม Chat ID + แจ้ง &quot;รอ admin อนุมัติ&quot;</li>
            <li>Contact คนนั้นจะปรากฏในตาราง &quot;Telegram contacts&quot; ด้านล่าง</li>
            <li>คลิก <strong>➕ Create user</strong> เพื่อสร้าง user ให้</li>
            <li>ผู้ใช้ใช้ username ที่สร้างไว้ login ที่ /login</li>
          </ol>
        </details>
      )}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className="w-32 shrink-0 text-xs uppercase tracking-wider text-slate-500">{label}</span>
      <span>{children}</span>
    </div>
  );
}
