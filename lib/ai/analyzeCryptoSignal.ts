import OpenAI from "openai";
import type { AIAnalysisResult, AIBias, RiskLevel, TradingViewPayload } from "@/types/signal";

const SYSTEM_PROMPT = `คุณคือผู้ช่วยวิเคราะห์สัญญาณการเทรด Bitcoin / Crypto
- ตอบเป็นภาษาไทยเท่านั้น
- ห้ามรับประกันผลตอบแทน
- ห้ามฟันธงว่าจะกำไรแน่นอน
- ระบุความเสี่ยงให้ชัดเจน
- ใช้ข้อมูลจาก signal, ราคา, timeframe, RSI, EMA, ADX, ATR%, HTF EMA, Volume vs MA หากมี
- ราคาเข้า / SL / TP ทุกตัวต้องเป็น "ตัวเลข" (numeric) เท่านั้น เพื่อให้ระบบ backtest ได้
- entry_low ต้องน้อยกว่าหรือเท่ากับ entry_high
- สำหรับ LONG: stop_loss_num < entry_low < take_profit_1_num < take_profit_2_num
- สำหรับ SHORT: take_profit_2_num < take_profit_1_num < entry_high < stop_loss_num
- เขียนกระชับ ชัดเจน อ่านง่ายบน Telegram
- ตอบกลับเป็น JSON เท่านั้น ไม่ต้องอธิบายเพิ่ม

=== กฎ Market Regime ===
ประเมิน regime ก่อนตัดสินใจเสมอ:
- TRENDING: ADX >= 25 และ trend EMA ชัดเจน → ส่งสัญญาณตามเทรนด์ได้
- RANGING:  ADX < 20 หรือ ATR% < 0.30 → ตอบ WAIT (ตลาด chop / dead)
- VOLATILE: ATR% > 1.5 → confidence ไม่เกิน 55 (ความเสี่ยง slippage สูง)

=== กฎ Confidence Calibration (สำคัญมาก) ===
ห้ามให้คะแนน confidence "เกาะกลุ่ม" 70-80 ทุกครั้ง — ต้องกระจายตาม checklist ที่ผ่าน:
- 90-100: setup เกือบ perfect (ADX > 30, volume > 1.5× MA, HTF aligned, RSI อยู่ใน sweet spot, R:R ≥ 2)
- 75-89:  setup ดี ผ่านเงื่อนไขหลักครบ (trend + volume + RSI)
- 60-74:  setup พอใช้ ผ่านเกณฑ์บางส่วน
- 50-59:  setup คลุมเครือ → ตอบ WAIT
- < 50:   signal อ่อน → ตอบ WAIT

=== กฎบังคับให้ตอบ WAIT (override ทุกอย่าง) ===
- ADX < 20 หรือ ATR% < 0.30 (ตลาด ranging/dead) → WAIT
- R:R (TP1-entry) / (entry-SL) < 1.0 → WAIT
- Volume < 0.8× MA (volume bot) → WAIT
- ข้อมูลไม่เพียงพอ → WAIT
ถ้า bias = WAIT → เซต entry/SL/TP เป็น null และอธิบายเหตุผลใน reasoning_th

=== กฎ checklist ===
ต้องตอบ field "checklist" เป็น JSON object ระบุว่าผ่านเงื่อนไขใดบ้าง:
{ "trend_aligned": bool, "volume_confirms": bool, "rsi_in_zone": bool, "rr_acceptable": bool, "regime": "TRENDING"|"RANGING"|"VOLATILE" }
ต้องผ่านอย่างน้อย 3/4 ถึงให้ LONG/SHORT ได้ (regime = RANGING → WAIT เสมอ)`;

function buildUserPrompt(p: TradingViewPayload): string {
  // Payload from Pine v2 includes adx, atr, atr_pct, htf_ema, volume, volume_ma — wire them in
  const pp = p as TradingViewPayload & {
    adx?: number | string;
    atr?: number | string;
    atr_pct?: number | string;
    htf_ema?: number | string;
    volume?: number | string;
    volume_ma?: number | string;
    fast_ema?: number | string;
    slow_ema?: number | string;
    trend_ema?: number | string;
  };
  const vol = Number(pp.volume);
  const volMa = Number(pp.volume_ma);
  const volMult =
    Number.isFinite(vol) && Number.isFinite(volMa) && volMa > 0
      ? (vol / volMa).toFixed(2)
      : "-";
  const price = Number(p.price);
  const htf = Number(pp.htf_ema);
  const htfBias =
    Number.isFinite(price) && Number.isFinite(htf) && htf > 0
      ? price > htf
        ? "above HTF (bullish bias)"
        : "below HTF (bearish bias)"
      : "-";

  return `วิเคราะห์สัญญาณ Crypto จาก TradingView ต่อไปนี้:

เหรียญ (symbol): ${p.symbol}
Exchange: ${p.exchange ?? "-"}
Timeframe: ${p.interval}
Signal: ${p.signal}
ราคา (price): ${p.price}
Strategy: ${p.strategy ?? "-"}
RSI: ${p.rsi ?? "-"}
ADX: ${pp.adx ?? "-"}  (>25 = trending, <20 = ranging, >30 = strong trend)
ATR%: ${pp.atr_pct ?? "-"}  (<0.30 = dead market, >1.5 = volatile)
EMA Fast: ${pp.fast_ema ?? p.ema_fast ?? "-"}
EMA Slow: ${pp.slow_ema ?? p.ema_slow ?? "-"}
Trend EMA: ${pp.trend_ema ?? "-"}
HTF EMA50: ${pp.htf_ema ?? "-"} (${htfBias})
Volume vs MA: ${volMult}× (>1.3× = good, <0.8× = weak)
เวลา: ${p.time}
หมายเหตุ: ${p.note ?? "-"}

ตอบกลับเป็น JSON ตามรูปแบบนี้เท่านั้น:
{
  "checklist": {
    "trend_aligned": true | false,
    "volume_confirms": true | false,
    "rsi_in_zone": true | false,
    "rr_acceptable": true | false,
    "regime": "TRENDING" | "RANGING" | "VOLATILE"
  },
  "bias": "LONG" | "SHORT" | "WAIT",
  "confidence": 0-100,
  "entry_zone": "ข้อความบรรยาย เช่น 65000 - 65300",
  "entry_low": ตัวเลขขอบล่างของโซนเข้า,
  "entry_high": ตัวเลขขอบบนของโซนเข้า,
  "stop_loss": "ข้อความบรรยาย",
  "stop_loss_num": ตัวเลข SL,
  "take_profit_1": "ข้อความบรรยาย",
  "take_profit_1_num": ตัวเลข TP1,
  "take_profit_2": "ข้อความบรรยาย",
  "take_profit_2_num": ตัวเลข TP2,
  "risk_level": "Low" | "Medium" | "High",
  "summary_th": "สรุปสั้น ๆ 1-2 ประโยค",
  "reasoning_th": "เหตุผลประกอบสั้น ๆ — ระบุด้วยว่า regime อะไร และผ่าน checklist กี่ข้อ"
}

ย้ำ: ถ้า regime = RANGING หรือ checklist ผ่าน < 3/4 หรือ R:R < 1.0 → bias = "WAIT" และ set ราคาทุกตัวเป็น null`;
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

function coerceNumeric(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export async function analyzeCryptoSignal(
  payload: TradingViewPayload
): Promise<{ result: AIAnalysisResult; raw: unknown }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const client = new OpenAI({ apiKey });

  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    // Lower temperature → more consistent confidence calibration across signals.
    temperature: 0,
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
    entry_low: coerceNumeric(parsed.entry_low),
    entry_high: coerceNumeric(parsed.entry_high),
    stop_loss: String(parsed.stop_loss ?? "-"),
    stop_loss_num: coerceNumeric(parsed.stop_loss_num),
    take_profit_1: String(parsed.take_profit_1 ?? "-"),
    take_profit_1_num: coerceNumeric(parsed.take_profit_1_num),
    take_profit_2: String(parsed.take_profit_2 ?? "-"),
    take_profit_2_num: coerceNumeric(parsed.take_profit_2_num),
    risk_level: coerceRisk(parsed.risk_level),
    summary_th: String(parsed.summary_th ?? "-"),
    reasoning_th: String(parsed.reasoning_th ?? "-"),
  };

  return { result, raw: parsed };
}
