import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Crypto AI Signal Webhook",
  description: "TradingView → AI → Telegram",
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
