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

const REQUIRED_FIELDS = ["symbol", "interval", "price", "signal", "time"] as const;

function badRequest(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "TradingView webhook endpoint. Use POST.",
  });
}

export async function POST(req: NextRequest) {
  let payload: TradingViewPayload;
  try {
    payload = (await req.json()) as TradingViewPayload;
  } catch {
    return badRequest("Invalid JSON body");
  }

  const expectedSecret = process.env.TRADINGVIEW_WEBHOOK_SECRET;
  if (!expectedSecret) {
    return badRequest("Server missing TRADINGVIEW_WEBHOOK_SECRET", 500);
  }
  if (!payload || payload.secret !== expectedSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const missing = REQUIRED_FIELDS.filter(
    (k) => payload[k] === undefined || payload[k] === null || payload[k] === ""
  );
  if (missing.length) {
    return badRequest(`Missing required fields: ${missing.join(", ")}`);
  }

  const supabase = getSupabaseAdmin();

  const priceNum = Number(payload.price);
  const { secret: _secret, ...rawForStorage } = payload;
  void _secret;

  const { data: signalRow, error: signalErr } = await supabase
    .from("tradingview_signals")
    .insert({
      symbol: payload.symbol,
      exchange: payload.exchange ?? null,
      interval: payload.interval,
      price: Number.isFinite(priceNum) ? priceNum : null,
      signal: payload.signal,
      strategy: payload.strategy ?? null,
      raw_payload: rawForStorage,
    })
    .select("id")
    .single();

  if (signalErr || !signalRow) {
    return NextResponse.json(
      { ok: false, error: `Supabase insert failed: ${signalErr?.message ?? "unknown"}` },
      { status: 500 }
    );
  }

  const signalId = signalRow.id as string;

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
        error: `AI analysis failed: ${
          err instanceof Error ? err.message : "unknown"
        }`,
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
      stop_loss: aiResult.stop_loss,
      take_profit_1: aiResult.take_profit_1,
      take_profit_2: aiResult.take_profit_2,
      risk_level: aiResult.risk_level,
      summary_th: aiResult.summary_th,
      reasoning_th: aiResult.reasoning_th,
      telegram_sent: false,
      ai_raw_response: aiRaw,
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
