"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

// Light/dark toggle. The actual initial theme is applied by an inline script
// in app/layout.tsx (before paint, no flash). This component just syncs UI
// state to the DOM attribute + localStorage on click.
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const current =
      document.documentElement.getAttribute("data-theme") === "light"
        ? "light"
        : "dark";
    setTheme(current);
    setMounted(true);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    if (next === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    try {
      localStorage.setItem("theme", next);
    } catch {
      // ignore (private mode etc.)
    }
  };

  // Avoid hydration mismatch — render a stable placeholder until mounted.
  const label = !mounted ? "🌙" : theme === "dark" ? "☀️" : "🌙";
  const title = !mounted
    ? "Toggle theme"
    : theme === "dark"
    ? "สลับเป็น Light mode"
    : "สลับเป็น Dark mode";

  return (
    <button
      type="button"
      onClick={toggle}
      title={title}
      aria-label={title}
      className="flex h-9 w-9 items-center justify-center rounded-chip border border-white/5 bg-surface-2/60 text-[15px] transition hover:bg-surface-3"
    >
      <span suppressHydrationWarning>{label}</span>
    </button>
  );
}
