import "./globals.css";
import type { Metadata } from "next";
import { Inter, JetBrains_Mono, IBM_Plex_Sans_Thai } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});
const plexThai = IBM_Plex_Sans_Thai({
  subsets: ["thai"],
  variable: "--font-thai",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "Tradesure by D2Infinite",
    template: "%s · Tradesure",
  },
  description:
    "Tradesure by D2Infinite — TradingView signals enriched with AI analysis, backtested on Binance, delivered via Telegram.",
  applicationName: "Tradesure",
  authors: [{ name: "Arnon Arpaket" }],
  themeColor: "#07090d",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrains.variable} ${plexThai.variable}`}
    >
      <body className="min-h-screen bg-bg-base text-ink-primary antialiased flex flex-col font-sans">
        <div className="flex-1">{children}</div>
        <footer className="mt-12 border-t border-white/5 bg-black/30 py-4">
          <div className="mx-auto max-w-[1480px] px-7 text-center text-xs text-ink-muted">
            © {new Date().getFullYear()} ·{" "}
            <span className="text-ink-secondary">Tradesure by D2infinite</span>
            {" · "}
            <span>Developed by Arnon Arpaket</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
