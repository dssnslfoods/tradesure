"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Icon, { type IconName } from "@/components/ui/Icon";

type NotificationType =
  | "WIN_TP1"
  | "WIN_TP2"
  | "LOSS_SL"
  | "NEW_CONTACT"
  | "OPEN"
  | "PENDING";

interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  subtitle: string;
  link?: string;
  at: string;
}

const POLL_MS = 30_000;
const READ_KEY = "ts_notifications_last_read";

function getLastRead(): number {
  if (typeof window === "undefined") return 0;
  const v = window.localStorage.getItem(READ_KEY);
  return v ? Number(v) : 0;
}

function setLastRead(ts: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(READ_KEY, String(ts));
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (diff < 60_000) return "เมื่อสักครู่";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} นาทีก่อน`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} ชั่วโมงก่อน`;
  return `${Math.floor(diff / 86_400_000)} วันก่อน`;
}

const TYPE_META: Record<
  NotificationType,
  { icon: IconName; cls: string; label: string }
> = {
  WIN_TP1: {
    icon: "circle-check",
    cls: "bg-sig-buy/15 text-sig-buy border-sig-buy/30",
    label: "TP1",
  },
  WIN_TP2: {
    icon: "circle-check",
    cls: "bg-sig-buy/25 text-sig-buy border-sig-buy/40",
    label: "TP2",
  },
  LOSS_SL: {
    icon: "circle-x",
    cls: "bg-sig-sell/15 text-sig-sell border-sig-sell/30",
    label: "SL",
  },
  NEW_CONTACT: {
    icon: "user-plus",
    cls: "bg-sig-info/15 text-sig-info border-sig-info/30",
    label: "Contact",
  },
  OPEN: {
    icon: "clock",
    cls: "bg-sig-info/10 text-sig-info border-sig-info/20",
    label: "Open",
  },
  PENDING: {
    icon: "clock",
    cls: "bg-surface-3 text-ink-secondary border-white/10",
    label: "Pending",
  },
};

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRead, setLastReadState] = useState<number>(0);
  const ref = useRef<HTMLDivElement>(null);

  // Init last-read from localStorage
  useEffect(() => {
    setLastReadState(getLastRead());
  }, []);

  // Poll
  useEffect(() => {
    let cancelled = false;
    const fetchItems = async () => {
      try {
        const res = await fetch("/api/notifications/recent", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { ok: boolean; items?: NotificationItem[]; error?: string };
        if (cancelled) return;
        if (!data.ok) throw new Error(data.error ?? "fetch failed");
        setItems(data.items ?? []);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "fetch failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchItems();
    const t = setInterval(fetchItems, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  // Click outside to close
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) {
      document.addEventListener("mousedown", onDocClick);
      return () => document.removeEventListener("mousedown", onDocClick);
    }
  }, [open]);

  const unread = items.filter((it) => new Date(it.at).getTime() > lastRead).length;

  const onOpen = () => {
    setOpen((o) => {
      if (!o && items.length > 0) {
        // Mark all as read when opening
        const newest = Math.max(...items.map((it) => new Date(it.at).getTime()));
        setLastRead(newest);
        setLastReadState(newest);
      }
      return !o;
    });
  };

  const clearAll = () => {
    if (items.length === 0) return;
    const newest = Math.max(...items.map((it) => new Date(it.at).getTime()));
    setLastRead(newest);
    setLastReadState(newest);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={onOpen}
        className="relative flex h-9 w-9 items-center justify-center rounded-chip border border-white/5 bg-surface-1/60 text-ink-secondary transition hover:bg-surface-2 hover:text-ink-primary"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
      >
        <Icon name="bell" size={16} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-sig-buy px-1 text-[9px] font-bold leading-none text-bg-deep shadow-glow">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-2 top-[64px] z-30 origin-top-right overflow-hidden rounded-card border border-white/5 bg-surface-1 shadow-card backdrop-blur-glass sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[360px]">
          <div className="flex items-center justify-between border-b border-white/5 bg-surface-2/40 px-4 py-3">
            <div>
              <div className="text-[13px] font-semibold text-ink-primary">Notifications</div>
              <div className="text-[10px] text-ink-muted">
                {items.length === 0 ? "ยังไม่มี events" : `${items.length} recent · 7 วันล่าสุด`}
              </div>
            </div>
            {items.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="text-[10px] text-brand hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[440px] overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="space-y-2 px-4 py-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex gap-3">
                    <div className="h-9 w-9 animate-pulse rounded-chip bg-surface-3" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-3/4 animate-pulse rounded bg-surface-3" />
                      <div className="h-3 w-1/2 animate-pulse rounded bg-surface-3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sig-sell/15 text-sig-sell">
                  <Icon name="alert-triangle" size={18} />
                </span>
                <div className="text-[12px] text-sig-sell">{error}</div>
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-ink-muted">
                  <Icon name="bell" size={20} />
                </span>
                <div className="text-[13px] font-semibold text-ink-secondary">
                  ทุกอย่างเงียบสงบ
                </div>
                <div className="text-[11px] text-ink-muted">
                  ไม่มี trigger ใหม่ใน 7 วันที่ผ่านมา
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-white/5">
                {items.map((it) => {
                  const isUnread = new Date(it.at).getTime() > lastRead;
                  const meta = TYPE_META[it.type];
                  const content = (
                    <div className="flex gap-3 px-4 py-3 transition hover:bg-surface-2/40">
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-chip border ${meta.cls}`}
                      >
                        <Icon name={meta.icon} size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <span
                            className={`text-[13px] font-semibold leading-tight ${
                              isUnread ? "text-ink-primary" : "text-ink-secondary"
                            }`}
                          >
                            {it.title}
                          </span>
                          {isUnread && (
                            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand shadow-glow" />
                          )}
                        </div>
                        <div className="mt-0.5 text-[11px] text-ink-muted">
                          {it.subtitle}
                        </div>
                        <div className="mt-1 text-[10px] font-mono text-ink-faint">
                          {relTime(it.at)}
                        </div>
                      </div>
                    </div>
                  );
                  return (
                    <li key={it.id}>
                      {it.link ? (
                        <Link href={it.link} onClick={() => setOpen(false)}>
                          {content}
                        </Link>
                      ) : (
                        content
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-white/5 bg-surface-2/40 px-4 py-2 text-center">
            <Link
              href="/dashboard"
              onClick={() => setOpen(false)}
              className="text-[11px] text-ink-secondary hover:text-brand"
            >
              ดู dashboard ทั้งหมด →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
