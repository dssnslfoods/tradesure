import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Crypto AI Signal Webhook",
  description: "TradingView → AI → Telegram",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-crypto-bg text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
