"use client";

import Icon from "@/components/ui/Icon";
import MobileNav from "./MobileNav";
import NotificationsBell from "./NotificationsBell";

export default function Topbar({
  username,
  isAdmin,
}: {
  username?: string | null;
  isAdmin: boolean;
}) {
  const initial = (username ?? "?").slice(0, 1).toUpperCase();

  return (
    <header className="sticky top-0 z-20 flex h-[60px] items-center gap-3 border-b border-white/5 bg-bg-base/70 px-4 backdrop-blur-glass sm:gap-4 sm:px-7">
      <MobileNav isAdmin={isAdmin} username={username} />

      <label className="relative hidden flex-1 max-w-md items-center sm:flex">
        <Icon
          name="search"
          size={16}
          className="absolute left-3 text-ink-muted"
        />
        <input
          type="search"
          placeholder="Search signals, symbols, users…"
          className="h-9 w-full rounded-chip border border-white/5 bg-surface-1/60 pl-9 pr-12 text-[13px] text-ink-primary placeholder:text-ink-muted focus:border-brand/40 focus:bg-surface-2"
        />
        <span className="absolute right-2 hidden items-center gap-0.5 rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-mono text-ink-muted md:flex">
          ⌘K
        </span>
      </label>

      {/* Mobile-only search button */}
      <button
        type="button"
        className="flex h-9 w-9 items-center justify-center rounded-chip border border-white/5 bg-surface-1/60 text-ink-secondary sm:hidden"
        aria-label="Search"
      >
        <Icon name="search" size={16} />
      </button>

      <div className="flex flex-1 items-center justify-end gap-2 sm:gap-3">
        <div className="hidden items-center gap-2 rounded-chip border border-white/5 bg-surface-1/60 px-3 py-1.5 text-[11px] font-medium text-ink-secondary md:flex">
          <span className="pulse-dot" />
          Live · Binance
        </div>

        <NotificationsBell />

        <div className="flex items-center gap-2 rounded-chip border border-white/5 bg-surface-1/60 px-2 py-1.5">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold"
            style={{
              background:
                "linear-gradient(135deg, var(--accent-hi), var(--accent-lo))",
              color: "#001b14",
            }}
          >
            {initial}
          </span>
          <div className="hidden text-left leading-tight md:block">
            <div className="text-[12px] font-semibold text-ink-primary">
              {username ?? "guest"}
            </div>
            <div className="flex items-center gap-1 text-[9px] uppercase tracking-eyebrow text-ink-muted">
              {isAdmin && <Icon name="shield-check" size={10} />}
              {isAdmin ? "admin" : "user"}
            </div>
          </div>
          <Icon name="chevron-down" size={14} className="text-ink-muted hidden md:block" />
        </div>
      </div>
    </header>
  );
}
