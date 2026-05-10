"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { findUserById } from "@/lib/auth/otp";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth/session";
import { analyzeCryptoSignal } from "@/lib/ai/analyzeCryptoSignal";
import {
  buildTelegramMessage,
  sendTelegramMessage,
} from "@/lib/telegram/sendTelegramMessage";
import type { TradingViewPayload } from "@/types/signal";

async function requireUser(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const c = await cookies();
  const session = await verifySessionToken(c.get(SESSION_COOKIE)?.value ?? null);
  if (!session) return { ok: false, error: "ยังไม่ได้ login" };
  const user = await findUserById(session.uid);
  if (!user || !user.is_active) return { ok: false, error: "user inactive" };
  return { ok: true, userId: user.id };
}

// =====================================================
// Watchlist
// =====================================================

export async function addToWatchlist(symbol: string, base: string) {
  const guard = await requireUser();
  if (!guard.ok) return guard;
  if (!symbol || !base) return { ok: false, error: "missing symbol/base" };
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("watchlist_items").insert({
      user_id: guard.userId,
      symbol,
      base,
    });
    if (error && !error.message.includes("duplicate")) throw error;
    revalidatePath("/dashboard/trending");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}

export async function removeFromWatchlist(symbol: string) {
  const guard = await requireUser();
  if (!guard.ok) return guard;
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("watchlist_items")
      .delete()
      .eq("user_id", guard.userId)
      .eq("symbol", symbol);
    if (error) throw error;
    revalidatePath("/dashboard/trending");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}

// =====================================================
// Auto-analyze a trending coin → creates signal + analysis + Telegram
// =====================================================

export async function analyzeTrendingCoin(input: {
  symbol: string;
  interval?: string; // default "60" (1h)
  hint?: "BUY" | "SELL"; // direction hint based on 24h change
}) {
  const guard = await requireUser();
  if (!guard.ok) return guard;

  const symbol = input.symbol.toUpperCase();
  const interval = input.interval ?? "60";

  try {
    // Pull latest price + 24h ticker for context.
    const tickerRes = await fetch(
      `https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`,
      { cache: "no-store" }
    );
    if (!tickerRes.ok) throw new Error(`Binance ticker ${tickerRes.status}`);
    const t = (await tickerRes.json()) as {
      lastPrice: string;
      priceChangePercent: string;
      highPrice: string;
      lowPrice: string;
      openPrice: string;
      volume: string;
      quoteVolume: string;
    };
    const price = Number(t.lastPrice);
    const changePct = Number(t.priceChangePercent);
    if (!Number.isFinite(price) || price <= 0) throw new Error("bad price");

    const signal: "BUY" | "SELL" =
      input.hint ?? (changePct >= 0 ? "BUY" : "SELL");

    // Build a synthetic TradingView-style payload with current price and
    // 24h context. AI prompt will compute SL/TP.
    const nowMs = Date.now();
    const payload: TradingViewPayload = {
      symbol,
      exchange: "BINANCE",
      interval,
      price,
      time: String(nowMs),
      signal,
      strategy: "manual:trending",
      note: `Manually analyzed from trending dashboard. 24h change ${changePct.toFixed(2)}%, high ${t.highPrice}, low ${t.lowPrice}, volume ${t.quoteVolume} USDT.`,
    };

    const supabase = getSupabaseAdmin();

    // Insert signal
    const { data: signalRow, error: sErr } = await supabase
      .from("tradingview_signals")
      .insert({
        symbol,
        exchange: "BINANCE",
        interval,
        price,
        signal,
        strategy: "manual:trending",
        raw_payload: payload,
      })
      .select("id")
      .single();
    if (sErr || !signalRow) throw new Error(sErr?.message ?? "insert signal failed");

    // Run AI
    const { result: ai, raw: aiRaw } = await analyzeCryptoSignal(payload);

    // Insert analysis
    const { data: analysisRow, error: aErr } = await supabase
      .from("ai_signal_analysis")
      .insert({
        signal_id: signalRow.id,
        symbol,
        interval,
        bias: ai.bias,
        confidence: ai.confidence,
        entry_zone: ai.entry_zone,
        entry_low: ai.entry_low,
        entry_high: ai.entry_high,
        stop_loss: ai.stop_loss,
        stop_loss_num: ai.stop_loss_num,
        take_profit_1: ai.take_profit_1,
        take_profit_1_num: ai.take_profit_1_num,
        take_profit_2: ai.take_profit_2,
        take_profit_2_num: ai.take_profit_2_num,
        risk_level: ai.risk_level,
        summary_th: ai.summary_th,
        reasoning_th: ai.reasoning_th,
        telegram_sent: false,
        ai_raw_response: aiRaw,
        outcome: ai.bias === "WAIT" ? "SKIP_WAIT" : "PENDING",
      })
      .select("id")
      .single();
    if (aErr || !analysisRow) throw new Error(aErr?.message ?? "insert analysis failed");

    // Send Telegram (best-effort)
    const message = buildTelegramMessage(payload, ai);
    const tg = await sendTelegramMessage(message);
    if (tg.ok) {
      await supabase
        .from("ai_signal_analysis")
        .update({ telegram_sent: true })
        .eq("id", analysisRow.id);
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/trending");
    return {
      ok: true,
      signal_id: signalRow.id,
      analysis_id: analysisRow.id,
      bias: ai.bias,
      confidence: ai.confidence,
      telegram_sent: tg.ok,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}
