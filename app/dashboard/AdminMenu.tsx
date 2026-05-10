"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const ADMIN_ITEMS: { href: string; icon: string; label: string; desc: string }[] = [
  {
    href: "/dashboard/users",
    icon: "👥",
    label: "Users",
    desc: "จัดการบัญชีผู้ใช้ + Telegram contacts",
  },
  {
    href: "/dashboard/schedule",
    icon: "⏰",
    label: "Schedule",
    desc: "Pause/resume backtest + run history",
  },
];

export default function AdminMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", onClickOutside);
      return () => document.removeEventListener("mousedown", onClickOutside);
    }
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-300 hover:bg-amber-500/20"
      >
        ⚙️ Admin
        <span
          className={`ml-1 text-xs transition-transform ${open ? "rotate-180" : ""}`}
        >
          ▼
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-72 overflow-hidden rounded-xl border border-amber-500/30 bg-crypto-panel shadow-2xl">
          <div className="border-b border-crypto-border bg-amber-500/5 px-4 py-2">
            <div className="text-[10px] uppercase tracking-wider text-amber-400">
              Admin only
            </div>
            <div className="text-xs text-slate-400">
              เฉพาะ admin เห็นเมนูนี้
            </div>
          </div>
          <ul>
            {ADMIN_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex flex-col gap-0.5 border-b border-crypto-border px-4 py-3 text-sm transition hover:bg-black/30 last:border-b-0"
                >
                  <span className="font-semibold text-slate-100">
                    {item.icon} {item.label}
                  </span>
                  <span className="text-[11px] text-slate-500">{item.desc}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
