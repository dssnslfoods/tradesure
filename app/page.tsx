import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="text-4xl font-bold tracking-tight">
        🚀 Crypto AI Signal Webhook
      </h1>
      <p className="mt-4 text-slate-400">
        Receive TradingView alerts, analyze with AI, push to Telegram, archive in Supabase.
      </p>
      <div className="mt-8 flex gap-4">
        <Link
          href="/dashboard"
          className="rounded-lg bg-crypto-accent px-5 py-2.5 font-semibold text-black hover:opacity-90"
        >
          Open Dashboard
        </Link>
        <a
          href="https://github.com/"
          className="rounded-lg border border-crypto-border px-5 py-2.5 font-semibold text-slate-200 hover:bg-crypto-panel"
        >
          README
        </a>
      </div>
      <div className="mt-12 rounded-xl border border-crypto-border bg-crypto-panel p-6">
        <h2 className="text-lg font-semibold">Webhook Endpoint</h2>
        <code className="mt-2 block rounded bg-black/40 p-3 text-sm text-emerald-300">
          POST /api/webhook/tradingview
        </code>
      </div>
    </main>
  );
}
