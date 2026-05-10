import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { analyzeCryptoSignal } from "@/lib/ai/analyzeCryptoSignal";
import {
  buildTelegramMessage,
  sendTelegramMessage,
} from "@/lib/telegram/sendTelegramMessage";
import type { TradingViewPayload } from "@/types/signal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Internal endpoint: invoked by /api/webhook/tradingview after it has
// already persisted the signal row. Runs AI + Telegram + analysis insert in
// the background so the public webhook can respond to TradingView in <3s.
export async function POST(req: NextRequest) {
  const expectedSecret = process.env.TRADINGVIEW_WEBHOOK_SECRET;
  if (!expectedSecret) {
    return NextResponse.json(
      { ok: false, error: "Server missing TRADINGVIEW_WEBHOOK_SECRET" },
      { status: 500 }
    );
  }

  let body: { signal_id?: string; payload?: TradingViewPayload; secret?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (body.secret !== expectedSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!body.signal_id || !body.payload) {
    return NextResponse.json({ ok: false, error: "Missing signal_id or payload" }, { status: 400 });
  }

  const signalId = body.signal_id;
  const payload = body.payload;
  const supabase = getSupabaseAdmin();

  let aiResult;
  let aiRaw: unknown = null;
  try {
    const out = await analyzeCryptoSignal(payload);
    aiResult = out.result;
    aiRaw = out.raw;
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        signal_id: signalId,
        error: `AI analysis failed: ${err instanceof Error ? err.message : "unknown"}`,
      },
      { status: 502 }
    );
  }

  const { data: analysisRow, error: analysisErr } = await supabase
    .from("ai_signal_analysis")
    .insert({
      signal_id: signalId,
      symbol: payload.symbol,
      interval: payload.interval,
      bias: aiResult.bias,
      confidence: aiResult.confidence,
      entry_zone: aiResult.entry_zone,
      entry_low: aiResult.entry_low,
      entry_high: aiResult.entry_high,
      stop_loss: aiResult.stop_loss,
      stop_loss_num: aiResult.stop_loss_num,
      take_profit_1: aiResult.take_profit_1,
      take_profit_1_num: aiResult.take_profit_1_num,
      take_profit_2: aiResult.take_profit_2,
      take_profit_2_num: aiResult.take_profit_2_num,
      risk_level: aiResult.risk_level,
      summary_th: aiResult.summary_th,
      reasoning_th: aiResult.reasoning_th,
      telegram_sent: false,
      ai_raw_response: aiRaw,
      outcome: aiResult.bias === "WAIT" ? "SKIP_WAIT" : "PENDING",
    })
    .select("id")
    .single();

  if (analysisErr || !analysisRow) {
    return NextResponse.json(
      {
        ok: false,
        signal_id: signalId,
        error: `Analysis insert failed: ${analysisErr?.message ?? "unknown"}`,
      },
      { status: 500 }
    );
  }

  const analysisId = analysisRow.id as string;

  const message = buildTelegramMessage(payload, aiResult);
  const tg = await sendTelegramMessage(message);

  if (tg.ok) {
    await supabase
      .from("ai_signal_analysis")
      .update({ telegram_sent: true })
      .eq("id", analysisId);
  }

  return NextResponse.json({
    ok: true,
    signal_id: signalId,
    analysis_id: analysisId,
    telegram_sent: tg.ok,
    telegram_error: tg.ok ? undefined : tg.error,
  });
}
