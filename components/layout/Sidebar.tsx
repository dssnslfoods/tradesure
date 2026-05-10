"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import Logo from "@/components/ui/Logo";
import Icon, { type IconName } from "@/components/ui/Icon";

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  adminOnly?: boolean;
}

const PRIMARY: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/dashboard/analytics", label: "Analytics", icon: "device-analytics" },
  { href: "/dashboard/trending", label: "Trending", icon: "flame" },
];

const ADMIN: NavItem[] = [
  { href: "/dashboard/users", label: "Users & Telegram", icon: "users", adminOnly: true },
  { href: "/dashboard/schedule", label: "Schedule", icon: "clock", adminOnly: true },
];

export default function Sidebar({
  isAdmin,
  username,
}: {
  isAdmin: boolean;
  username?: string | null;
}) {
  const pathname = usePathname();
  const [pending, start] = useTransition();

  const onLogout = () => {
    if (!confirm("ออกจากระบบ?")) return;
    start(async () => {
      await fetch("/api/auth/logout", { method: "POST", cache: "no-store" });
      window.location.href = "/login";
    });
  };

  return (
    <aside className="sticky top-0 hidden h-screen w-[256px] shrink-0 flex-col border-r border-white/5 bg-bg-deep lg:flex">
      <div className="flex items-center px-5 py-5">
        <Logo size={32} withText />
      </div>

      <nav className="flex-1 space-y-1 px-3">
        <div className="px-3 py-2 eyebrow">Workspace</div>
        {PRIMARY.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
        ))}

        {isAdmin && (
          <>
            <div className="mt-6 px-3 py-2 eyebrow flex items-center justify-between">
              <span>Admin</span>
              <span className="rounded bg-sig-warn/15 px-1.5 py-0.5 text-[9px] font-bold text-sig-warn">
                STAFF
              </span>
            </div>
            {ADMIN.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
            ))}
          </>
        )}

        <div className="mt-6 px-3">
          <div className="rounded-card border border-white/5 bg-surface-1 p-3">
            <div className="flex items-center gap-2">
              <Icon name="lightning" size={14} className="text-sig-warn" />
              <span className="eyebrow text-[10px] !text-ink-secondary">AI Insights</span>
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-ink-muted">
              Win rate ดีขึ้นเมื่อ confidence ≥ 70% — ตั้ง filter ใน Pine Script เพื่อกรองสัญญาณ
            </p>
          </div>
        </div>
      </nav>

      <div className="border-t border-white/5 p-3">
        <button
          type="button"
          onClick={onLogout}
          disabled={pending}
          className="flex w-full items-center gap-3 rounded-chip px-3 py-2.5 text-sm font-medium text-ink-secondary transition hover:bg-surface-2 hover:text-ink-primary disabled:opacity-50"
        >
          <Icon name="logout" size={16} />
          <span className="flex-1 text-left">{pending ? "Logging out…" : "Logout"}</span>
          {username && (
            <span className="text-[10px] text-ink-muted">{username}</span>
          )}
        </button>
      </div>
    </aside>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(href + "/");
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={`group relative flex items-center gap-3 rounded-chip px-3 py-2.5 text-[13px] font-medium transition ${
        active
          ? "bg-gradient-to-r from-brand/20 to-transparent text-ink-primary shadow-glow"
          : "text-ink-secondary hover:bg-surface-2 hover:text-ink-primary"
      }`}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-brand shadow-[0_0_12px_rgba(0,212,170,0.7)]" />
      )}
      <Icon name={item.icon} size={18} className={active ? "text-brand" : ""} />
      <span>{item.label}</span>
    </Link>
  );
}
