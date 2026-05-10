"use client";

import { useTransition } from "react";

export default function LogoutButton({ username }: { username?: string | null }) {
  const [pending, startTransition] = useTransition();

  const onLogout = () => {
    if (!confirm("ออกจากระบบ?")) return;
    startTransition(async () => {
      await fetch("/api/auth/logout", { method: "POST", cache: "no-store" });
      window.location.href = "/login";
    });
  };

  return (
    <button
      type="button"
      onClick={onLogout}
      disabled={pending}
      className="rounded-lg border border-crypto-border bg-crypto-panel px-3 py-2 text-sm text-slate-300 hover:bg-black/30 disabled:opacity-40"
      title={username ? `Logged in as ${username}` : "Logout"}
    >
      {pending ? "…" : `🚪 ${username ? username : "Logout"}`}
    </button>
  );
}
