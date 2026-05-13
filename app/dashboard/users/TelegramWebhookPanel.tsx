"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteTelegramWebhook,
  getTelegramWebhookInfo,
  setTelegramWebhook,
  type TelegramWebhookInfo,
} from "./actions";
import Icon from "@/components/ui/Icon";

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
        setMsg({ tone: "success", text: `ผูก webhook สำเร็จ → ${r.url}` });
        const fresh = await getTelegramWebhookInfo();
        setInfo(fresh);
        router.refresh();
      } else {
        setMsg({ tone: "error", text: r.error ?? "failed" });
      }
    });
  };

  const onDelete = () => {
    if (!confirm("ยกเลิก webhook? Bot จะไม่รับ message จนกว่าจะ setup ใหม่")) return;
    setMsg(null);
    startTransition(async () => {
      const r = await deleteTelegramWebhook();
      if (r.ok) {
        setMsg({ tone: "success", text: "ยกเลิก webhook แล้ว" });
        const fresh = await getTelegramWebhookInfo();
        setInfo(fresh);
      } else {
        setMsg({ tone: "error", text: r.error ?? "failed" });
      }
    });
  };

  const onTestBroadcast = () => {
    setMsg(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/broadcast-test", {
          method: "POST",
          cache: "no-store",
        });
        const data = (await res.json()) as {
          ok: boolean;
          sent?: number;
          failed?: number;
          recipients?: string[];
          errors?: string[];
          error?: string;
        };
        if (data.ok) {
          setMsg({
            tone: "success",
            text: `ส่ง Configuration snapshot สำเร็จ — ${data.sent} chat${
              data.failed ? ` (failed ${data.failed})` : ""
            } ได้รับสรุประบบใน Telegram`,
          });
        } else {
          setMsg({
            tone: "error",
            text: data.error ?? data.errors?.join(", ") ?? "failed",
          });
        }
      } catch (e) {
        setMsg({ tone: "error", text: e instanceof Error ? e.message : "failed" });
      }
    });
  };

  const isOk = info?.ok && info.url && info.url.endsWith(EXPECTED_PATH);
  const isOtherUrl = info?.ok && info.url && !info.url.endsWith(EXPECTED_PATH);
  const isUnset = info?.ok && !info.url;

  return (
    <section className="card mb-7 p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-chip bg-sig-info/15 text-sig-info">
            <Icon name="robot" size={18} />
          </span>
          <div>
            <h2 className="text-[15px] font-semibold text-ink-primary">Telegram Bot Webhook</h2>
            <p className="mt-0.5 text-[11px] text-ink-muted">
              ระบบจะรับ message จาก Telegram และเก็บ chat ID อัตโนมัติ
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={refresh}
            disabled={pending}
            className="btn btn-ghost !py-1.5 !text-[11px] disabled:opacity-40"
          >
            <Icon name="refresh" size={12} />
            Refresh
          </button>
          <button
            type="button"
            onClick={onTestBroadcast}
            disabled={pending}
            title="ส่ง Configuration snapshot ไปยังทุก user ผ่าน Telegram — เป็นทั้ง test broadcast และ system status update"
            className="btn !bg-sig-warn/15 !text-sig-warn !border-sig-warn/30 hover:!bg-sig-warn/25 !py-1.5 !text-[11px] disabled:opacity-40"
          >
            <Icon name="send" size={12} />
            Broadcast status
          </button>
          {(isUnset || isOtherUrl) && (
            <button
              type="button"
              onClick={onSetup}
              disabled={pending}
              className="btn btn-primary !py-1.5 !text-[11px] disabled:opacity-40"
            >
              <Icon name="play" size={12} />
              {pending ? "กำลังตั้งค่า…" : "Setup webhook"}
            </button>
          )}
          {isOk && (
            <>
              <button
                type="button"
                onClick={onSetup}
                disabled={pending}
                className="btn !bg-sig-info/15 !text-sig-info !border-sig-info/30 hover:!bg-sig-info/25 !py-1.5 !text-[11px] disabled:opacity-40"
              >
                <Icon name="refresh" size={12} />
                Re-register
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={pending}
                className="btn !bg-sig-sell/15 !text-sig-sell !border-sig-sell/30 hover:!bg-sig-sell/25 !py-1.5 !text-[11px] disabled:opacity-40"
              >
                <Icon name="trash" size={12} />
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {loading && <p className="text-[11px] text-ink-muted">กำลังโหลดสถานะ…</p>}

      {!loading && info && (
        <div className="grid gap-3 rounded-card border border-white/5 bg-surface-2/30 p-4 text-[12px] sm:grid-cols-4">
          <KV
            label="Status"
            value={
              !info.ok ? (
                <span className="chip chip-sell !text-[10px]">
                  <Icon name="circle-x" size={10} />
                  Error
                </span>
              ) : isOk ? (
                <span className="chip chip-buy !text-[10px]">
                  <span className="pulse-dot !h-1.5 !w-1.5" />
                  Active
                </span>
              ) : isOtherUrl ? (
                <span className="chip chip-warn !text-[10px]">
                  <Icon name="alert-triangle" size={10} />
                  Wrong URL
                </span>
              ) : (
                <span className="chip chip-mute !text-[10px]">
                  <Icon name="circle-x" size={10} />
                  Not configured
                </span>
              )
            }
          />
          {info.url && (
            <KV label="URL" value={<code className="font-mono text-[11px] text-ink-secondary break-all">{info.url}</code>} span={3} />
          )}
          {typeof info.pending_update_count === "number" && (
            <KV label="Pending updates" value={<span className="font-mono tabular text-ink-primary">{info.pending_update_count}</span>} />
          )}
          {info.ip_address && <KV label="IP" value={<span className="font-mono text-ink-secondary">{info.ip_address}</span>} />}
          {info.allowed_updates && info.allowed_updates.length > 0 && (
            <KV label="Allowed" value={<span className="text-ink-secondary">{info.allowed_updates.join(", ")}</span>} />
          )}
          {info.error && <KV label="Error" value={<span className="text-sig-sell">{info.error}</span>} span={4} />}
          {info.last_error_message && (
            <KV
              label="Last error"
              value={<span className="text-sig-sell text-[11px]">{info.last_error_message}</span>}
              span={4}
            />
          )}
        </div>
      )}

      {msg && (
        <p
          className={`mt-3 flex items-start gap-2 rounded-chip border px-3 py-2 text-[11px] ${
            msg.tone === "success"
              ? "border-sig-buy/30 bg-sig-buy/10 text-sig-buy"
              : "border-sig-sell/30 bg-sig-sell/10 text-sig-sell"
          }`}
        >
          <Icon
            name={msg.tone === "success" ? "circle-check" : "alert-triangle"}
            size={12}
            className="mt-0.5"
          />
          {msg.text}
        </p>
      )}

      {isOk && (
        <details className="mt-3 text-[11px] text-ink-muted">
          <summary className="cursor-pointer text-ink-secondary hover:text-ink-primary">
            วิธีให้ user ใหม่เริ่มใช้งาน
          </summary>
          <ol className="mt-2 list-inside list-decimal space-y-1 pl-2">
            <li>
              ผู้ใช้ค้นหา bot ใน Telegram และส่งข้อความ{" "}
              <code className="font-mono text-brand">/start</code>
            </li>
            <li>Bot ตอบกลับพร้อม Chat ID + แจ้ง &quot;รอ admin อนุมัติ&quot;</li>
            <li>Contact คนนั้นจะปรากฏในตาราง &quot;Telegram contacts&quot; ด้านล่าง</li>
            <li>
              คลิก{" "}
              <strong className="text-sig-buy">+ Create user</strong> เพื่อสร้าง user ให้
            </li>
            <li>ผู้ใช้ใช้ username ที่สร้างไว้ login ที่ /login</li>
          </ol>
        </details>
      )}
    </section>
  );
}

function KV({
  label,
  value,
  span,
}: {
  label: string;
  value: React.ReactNode;
  span?: number;
}) {
  const colSpan = span ? `sm:col-span-${span}` : "";
  return (
    <div className={`min-w-0 ${colSpan}`}>
      <div className="eyebrow !text-[9px]">{label}</div>
      <div className="mt-1">{value}</div>
    </div>
  );
}
