import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // All theme-sensitive tokens point at CSS variables (defined in
        // app/globals.css) so they adapt to light/dark automatically.
        bg: {
          base: "var(--bg-base)",
          deep: "var(--bg-deep)",
        },
        surface: {
          1: "var(--surface-1)",
          2: "var(--surface-2)",
          3: "var(--surface-3)",
        },
        ink: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
          faint: "var(--text-faint)",
        },
        brand: {
          DEFAULT: "var(--accent)",
          hi: "var(--accent-hi)",
          lo: "var(--accent-lo)",
        },
        sig: {
          buy: "var(--buy)",
          sell: "var(--sell)",
          warn: "var(--warn)",
          info: "var(--info)",
          violet: "var(--violet)",
        },
        // Legacy aliases — keep old code working until full migration
        crypto: {
          bg: "var(--bg-base)",
          panel: "var(--surface-1)",
          border: "var(--border)",
          accent: "var(--accent)",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "var(--font-thai)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "var(--font-mono)",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      borderRadius: {
        chip: "10px",
        card: "16px",
        hero: "22px",
      },
      letterSpacing: {
        tightest: "-0.03em",
        eyebrow: "0.12em",
      },
      boxShadow: {
        card: "inset 0 1px 0 rgba(255,255,255,0.04), 0 12px 32px rgba(0,0,0,0.4)",
        glow: "0 0 24px rgba(0,212,170,0.25)",
        "glow-strong": "0 0 32px rgba(0,212,170,0.45)",
      },
      backdropBlur: {
        glass: "24px",
      },
      animation: {
        "pulse-ring": "pulse-ring 1.8s ease-out infinite",
        "blob-float": "blob-float 22s ease-in-out infinite",
        shimmer: "shimmer 3s ease-in-out infinite",
      },
      keyframes: {
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgba(0,212,170,0.45)" },
          "70%": { boxShadow: "0 0 0 12px rgba(0,212,170,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(0,212,170,0)" },
        },
        "blob-float": {
          "0%, 100%": { transform: "translate(0,0) scale(1)" },
          "33%": { transform: "translate(30px,-40px) scale(1.08)" },
          "66%": { transform: "translate(-20px,30px) scale(0.95)" },
        },
        shimmer: {
          "0%, 100%": { opacity: "0.0" },
          "50%": { opacity: "0.4" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
