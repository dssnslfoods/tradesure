import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getTrendingBuckets } from "@/lib/binance/topMovers";
import { sendTelegramMessage } from "@/lib/telegram/sendTelegramMessage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Triggered by Cloud Scheduler (or manually). Compares current Top 3
// "hottest" coins to the last seen snapshot stored in app_settings.
// If new symbols entered the Top 3, send a Telegram alert.

const SNAPSHOT_KEY = "trending_top3_snapshot";

function authorize(req: NextRequest): boolean {
  const expected = process.env.BACKTEST_CRON_SECRET;
  if (!expected) return true;
  const got =
    req.headers.get("x-cron-secret") ??
    req.nextUrl.searchParams.get("secret") ??
    "";
  return got === expected;
}

interface SnapshotValue {
  symbols: string[];
  taken_at: string;
}

export async function POST(req: NextRequest) {
  return handle(req);
}
export async function GET(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const buckets = await getTrendingBuckets(3, 5_000_000, "no_meme");
    const currentTop3 = buckets.hottest.slice(0, 3);
    const currentSymbols = currentTop3.map((t) => t.symbol);

    const supabase = getSupabaseAdmin();
    const { data: existing } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", SNAPSHOT_KEY)
      .maybeSingle();

    const previousSymbols: string[] =
      ((existing?.value as SnapshotValue | null)?.symbols ?? []) as string[];

    const newcomers = currentSymbols.filter((s) => !previousSymbols.includes(s));

    let telegramSent = false;
    if (newcomers.length > 0) {
      const lines = [
        "🔥 <b>Top 3 Trending — Newcomer Alert</b>",
        "",
        `เหรียญใหม่ที่เพิ่งติด Top 3 hottest:`,
      ];
      for (const sym of newcomers) {
        const t = currentTop3.find((x) => x.symbol === sym);
        if (!t) continue;
        const sign = t.priceChangePercent >= 0 ? "+" : "";
        lines.push(
          `• <b>${t.base}</b> · ${sign}${t.priceChangePercent.toFixed(2)}% · vol ${(t.quoteVolume / 1_000_000).toFixed(1)}M USDT`
        );
      }
      lines.push("");
      lines.push("📋 Top 3 ตอนนี้:");
      currentTop3.forEach((t, i) => {
        const sign = t.priceChangePercent >= 0 ? "+" : "";
        lines.push(`${i + 1}. <b>${t.base}</b>  ${sign}${t.priceChangePercent.toFixed(2)}%`);
      });
      lines.push("");
      lines.push(
        `ดูเพิ่มเติม: https://tradesure.d2infinite.com/dashboard/trending`
      );

      const tg = await sendTelegramMessage(lines.join("\n"));
      telegramSent = tg.ok;
    }

    // Update snapshot
    const newSnapshot: SnapshotValue = {
      symbols: currentSymbols,
      taken_at: new Date().toISOString(),
    };
    await supabase
      .from("app_settings")
      .upsert({ key: SNAPSHOT_KEY, value: newSnapshot }, { onConflict: "key" });

    return NextResponse.json({
      ok: true,
      current: currentSymbols,
      previous: previousSymbols,
      newcomers,
      telegram_sent: telegramSent,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}
