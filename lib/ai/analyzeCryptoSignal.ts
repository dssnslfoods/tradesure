import OpenAI from "openai";
import type { AIAnalysisResult, AIBias, RiskLevel, TradingViewPayload } from "@/types/signal";

const SYSTEM_PROMPT = `คุณคือผู้ช่วยวิเคราะห์สัญญาณการเทรด Bitcoin / Crypto
- ตอบเป็นภาษาไทยเท่านั้น
- ห้ามรับประกันผลตอบแทน
- ห้ามฟันธงว่าจะกำไรแน่นอน
- ระบุความเสี่ยงให้ชัดเจน
- ใช้ข้อมูลจาก signal, ราคา, timeframe, RSI, EMA หากมี
- หากข้อมูลไม่เพียงพอ ให้แนะนำ WAIT
- เขียนกระชับ ชัดเจน อ่านง่ายบน Telegram
- ตอบกลับเป็น JSON เท่านั้น ไม่ต้องอธิบายเพิ่ม`;

function buildUserPrompt(p: TradingViewPayload): string {
  return `วิเคราะห์สัญญาณ Crypto จาก TradingView ต่อไปนี้:

เหรียญ (symbol): ${p.symbol}
Exchange: ${p.exchange ?? "-"}
Timeframe: ${p.interval}
Signal: ${p.signal}
ราคา (price): ${p.price}
Strategy: ${p.strategy ?? "-"}
RSI: ${p.rsi ?? "-"}
EMA Fast: ${p.ema_fast ?? "-"}
EMA Slow: ${p.ema_slow ?? "-"}
เวลา: ${p.time}
หมายเหตุ: ${p.note ?? "-"}

ตอบกลับเป็น JSON ตามรูปแบบนี้เท่านั้น:
{
  "bias": "LONG" | "SHORT" | "WAIT",
  "confidence": 0-100,
  "entry_zone": "...",
  "stop_loss": "...",
  "take_profit_1": "...",
  "take_profit_2": "...",
  "risk_level": "Low" | "Medium" | "High",
  "summary_th": "สรุปสั้น ๆ 1-2 ประโยค",
  "reasoning_th": "เหตุผลประกอบสั้น ๆ"
}`;
}

function coerceBias(v: unknown): AIBias {
  const s = String(v ?? "").toUpperCase();
  if (s === "LONG" || s === "SHORT" || s === "WAIT") return s;
  return "WAIT";
}

function coerceRisk(v: unknown): RiskLevel {
  const s = String(v ?? "").toLowerCase();
  if (s.startsWith("low")) return "Low";
  if (s.startsWith("high")) return "High";
  return "Medium";
}

function coerceConfidence(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export async function analyzeCryptoSignal(
  payload: TradingViewPayload
): Promise<{ result: AIAnalysisResult; raw: unknown }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const client = new OpenAI({ apiKey });

  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(payload) },
    ],
  });

  const content = completion.choices[0]?.message?.content ?? "{}";
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("AI returned non-JSON response");
  }

  const result: AIAnalysisResult = {
    bias: coerceBias(parsed.bias),
    confidence: coerceConfidence(parsed.confidence),
    entry_zone: String(parsed.entry_zone ?? "-"),
    stop_loss: String(parsed.stop_loss ?? "-"),
    take_profit_1: String(parsed.take_profit_1 ?? "-"),
    take_profit_2: String(parsed.take_profit_2 ?? "-"),
    risk_level: coerceRisk(parsed.risk_level),
    summary_th: String(parsed.summary_th ?? "-"),
    reasoning_th: String(parsed.reasoning_th ?? "-"),
  };

  return { result, raw: parsed };
}
