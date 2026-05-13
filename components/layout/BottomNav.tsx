"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon, { type IconName } from "@/components/ui/Icon";

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  adminOnly?: boolean;
}

// Mirrors the desktop Sidebar so role-based visibility stays consistent.
// User sees 4 items; admin sees 6. We let the row scroll horizontally on very
// narrow screens (< 360px) so labels never get clipped.
const BASE_ITEMS: NavItem[] = [
  { href: "/dashboard",           label: "Dashboard", icon: "dashboard" },
  { href: "/dashboard/analytics", label: "Analytics", icon: "device-analytics" },
  { href: "/dashboard/trending",  label: "Trending",  icon: "flame" },
  { href: "/dashboard/help",      label: "Help",      icon: "info" },
];

const ADMIN_ITEMS: NavItem[] = [
  { href: "/dashboard/users",     label: "Users",     icon: "users",    adminOnly: true },
  { href: "/dashboard/schedule",  label: "Schedule",  icon: "clock",    adminOnly: true },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function BottomNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const items = isAdmin ? [...BASE_ITEMS, ...ADMIN_ITEMS] : BASE_ITEMS;

  return (
    <nav
      aria-label="Mobile primary navigation"
      // Fixed at the viewport bottom on mobile only. lg:hidden mirrors the
      // sidebar's lg:flex so we never double-show navigation.
      className="fixed bottom-0 left-0 right-0 z-30 border-t border-white/5 bg-bg-deep/95 backdrop-blur-glass lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-stretch overflow-x-auto">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group relative flex min-w-[68px] flex-1 flex-col items-center justify-center gap-1 px-2 py-2.5 text-[10px] font-semibold transition ${
                active
                  ? "text-brand"
                  : "text-ink-muted hover:text-ink-secondary"
              } ${item.adminOnly ? "border-l border-white/5" : ""}`}
            >
              {active && (
                <span className="absolute top-0 h-[3px] w-10 rounded-b-full bg-brand shadow-[0_0_12px_rgba(0,212,170,0.7)]" />
              )}
              <Icon
                name={item.icon}
                size={20}
                className={active ? "text-brand" : ""}
              />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
