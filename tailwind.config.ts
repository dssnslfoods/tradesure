import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          base: "#07090d",
          deep: "#050709",
        },
        surface: {
          1: "#0d1117",
          2: "#131922",
          3: "#1a212d",
        },
        ink: {
          primary: "#e7ecf2",
          secondary: "#9aa4b2",
          muted: "#5b6573",
          faint: "#3a4250",
        },
        brand: {
          DEFAULT: "#00d4aa",
          hi: "#2af0c5",
          lo: "#00b894",
        },
        sig: {
          buy: "#00d4aa",
          sell: "#ff5577",
          warn: "#ffb547",
          info: "#5aa2ff",
          violet: "#b87cff",
        },
        // Legacy aliases — keep old code working until full migration
        crypto: {
          bg: "#07090d",
          panel: "#0d1117",
          border: "rgba(255,255,255,0.08)",
          accent: "#00d4aa",
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
