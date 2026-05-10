import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Tradesure by D2Infinite",
    template: "%s · Tradesure",
  },
  description:
    "Tradesure by D2Infinite — TradingView signals enriched with AI analysis, backtested on Binance, delivered via Telegram.",
  applicationName: "Tradesure",
  authors: [{ name: "Arnon Arpaket" }],
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-crypto-bg text-slate-100 antialiased flex flex-col">
        <div className="flex-1">{children}</div>
        <footer className="mt-12 border-t border-crypto-border bg-black/20 py-4">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 text-center text-xs text-slate-500">
            © {new Date().getFullYear()} · Developed by{" "}
            <span className="font-semibold text-slate-300">Arnon Arpaket</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
