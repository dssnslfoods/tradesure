"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import Logo from "@/components/ui/Logo";
import Icon, { type IconName } from "@/components/ui/Icon";

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}
const PRIMARY: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/dashboard/analytics", label: "Analytics", icon: "device-analytics" },
  { href: "/dashboard/trending", label: "Trending", icon: "flame" },
];
const ADMIN: NavItem[] = [
  { href: "/dashboard/users", label: "Users & Telegram", icon: "users" },
  { href: "/dashboard/schedule", label: "Schedule", icon: "clock" },
];

export default function MobileNav({
  isAdmin,
  username,
}: {
  isAdmin: boolean;
  username?: string | null;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  // Close drawer on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (open) {
      const orig = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = orig;
      };
    }
  }, [open]);

  const onLogout = () => {
    if (!confirm("ออกจากระบบ?")) return;
    start(async () => {
      await fetch("/api/auth/logout", { method: "POST", cache: "no-store" });
      window.location.href = "/login";
    });
  };

  return (
    <>
      {/* Hamburger button (only on mobile) */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-chip border border-white/5 bg-surface-1/60 text-ink-secondary lg:hidden"
        aria-label="Open menu"
      >
        <Icon name="menu" size={18} />
      </button>

      {/* Drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />
          {/* Panel */}
          <div className="relative ml-0 flex h-full w-[280px] flex-col bg-bg-deep border-r border-white/5 animate-[slideIn_0.2s_ease-out]">
            <div className="flex items-center justify-between px-5 py-5">
              <Logo size={32} withText />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-chip text-ink-muted hover:bg-surface-2 hover:text-ink-primary"
                aria-label="Close"
              >
                <Icon name="x" size={16} />
              </button>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-5">
              <div className="px-3 py-2 eyebrow">Workspace</div>
              {PRIMARY.map((item) => (
                <DrawerLink
                  key={item.href}
                  item={item}
                  active={isActive(pathname, item.href)}
                />
              ))}

              {isAdmin && (
                <>
                  <div className="mt-6 flex items-center justify-between px-3 py-2 eyebrow">
                    <span>Admin</span>
                    <span className="rounded bg-sig-warn/15 px-1.5 py-0.5 text-[9px] font-bold text-sig-warn">
                      STAFF
                    </span>
                  </div>
                  {ADMIN.map((item) => (
                    <DrawerLink
                      key={item.href}
                      item={item}
                      active={isActive(pathname, item.href)}
                    />
                  ))}
                </>
              )}
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
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes slideIn {
          from {
            transform: translateX(-100%);
          }
          to {
            transform: translateX(0);
          }
        }
      `}</style>
    </>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(href + "/");
}

function DrawerLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={`group relative flex items-center gap-3 rounded-chip px-3 py-3 text-[14px] font-medium transition ${
        active
          ? "bg-gradient-to-r from-brand/20 to-transparent text-ink-primary"
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
