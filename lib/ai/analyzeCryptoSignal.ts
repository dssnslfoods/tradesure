import OpenAI from "openai";
import type { AIAnalysisResult, AIBias, RiskLevel, TradingViewPayload } from "@/types/signal";
import { callGemini } from "./gemini";
import { DEFAULT_AI_MODEL, providerFor } from "./models";
import { getApiKeys } from "@/lib/schedule/settings";
import { getMarketContext, type MarketContext } from "@/lib/market/context";

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

=== กฎ "Always-direction" (สำคัญ — ห้าม WAIT) ===
ระบบเก็บสถิติทุกสัญญาณเพื่อวัด edge per-confidence-bucket — ดังนั้น:
- **ห้ามตอบ "WAIT"** ไม่ว่ากรณีใดๆ
- ต้องเลือก bias เป็น "LONG" หรือ "SHORT" ทุกครั้ง — แม้ setup จะอ่อนแอ
- ต้องระบุ entry / SL / TP1 / TP2 เป็นตัวเลขทุกครั้ง (ห้าม null)
- ถ้า setup ไม่ดี → ตอบ recommended=false + confidence ต่ำ + risk_level=High
- แต่ direction + ราคายังต้องบอก เพื่อให้ระบบ backtest + track win rate ตาม confidence ได้

วิธีเลือก direction เมื่อ setup คลุมเครือ:
1. ดู trend EMA → close > trend = LONG, close < trend = SHORT
2. ถ้า trend EMA ไม่ชัด → ดู signal จาก Pine (BUY = LONG, SELL = SHORT)
3. ถ้ายังไม่ชัด → ดู RSI (>50 = LONG, <50 = SHORT)
4. ถ้ายังไม่ชัด → bias = LONG (default — ตลาดมี long bias ในระยะยาว)

=== กฎ Market Regime ===
ประเมิน regime ก่อนตัดสินใจเสมอ:
- TRENDING: ADX >= 25 และ trend EMA ชัดเจน → confidence 70-95
- RANGING:  ADX < 20 หรือ ATR% < 0.30 → confidence 30-50 + recommended=false
- VOLATILE: ATR% > 1.5 → confidence ไม่เกิน 55 + risk_level=High

=== กฎ Confidence Calibration (สำคัญมาก) ===
ห้ามให้คะแนน confidence "เกาะกลุ่ม" 70-80 ทุกครั้ง — ต้องกระจายตาม checklist ที่ผ่าน:
- 90-100: setup เกือบ perfect (ADX > 30, volume > 1.5× MA, HTF aligned, RSI อยู่ใน sweet spot, R:R ≥ 2) — recommended=true
- 75-89:  setup ดี ผ่านเงื่อนไขหลักครบ (trend + volume + RSI) — recommended=true
- 60-74:  setup พอใช้ ผ่านเกณฑ์บางส่วน — recommended=true ถ้า R:R ≥ 1.5, ไม่งั้น false
- 50-59:  setup คลุมเครือ — recommended=false (แต่ direction + ราคายังต้องบอก)
- 30-49:  signal อ่อน — recommended=false + risk_level=High
- < 30:   signal แย่มาก — recommended=false + risk_level=High

=== กฎ "ไม่แนะนำ" (recommended=false) — override ทุกอย่าง ===
ตอบ recommended=false (แต่ยัง bias + ราคา ครบ) เมื่อ:
- ADX < 20 หรือ ATR% < 0.30 (ตลาด ranging/dead)
- R:R (TP1-entry) / (entry-SL) < 1.0
- Volume < 0.8× MA
- ข้อมูลไม่เพียงพอ
- Setup ขัด trend HTF อย่างชัดเจน

=== กฎ checklist ===
ต้องตอบ field "checklist" เป็น JSON object ระบุว่าผ่านเงื่อนไขใดบ้าง:
{ "trend_aligned": bool, "volume_confirms": bool, "rsi_in_zone": bool, "rr_acceptable": bool, "regime": "TRENDING"|"RANGING"|"VOLATILE" }
ผ่าน ≥ 3/4 → recommended=true. ผ่าน < 3/4 → recommended=false.

=== Market Context Rules (สำคัญ — ปรับ confidence ตาม macro) ===
• Fear & Greed Index:
  - 0-25 (Extreme Fear): contrarian LONG opportunity, แต่เทรนด์อาจเปลี่ยน → LONG confidence +5, SHORT confidence -10
  - 25-50 (Fear): normal trading conditions
  - 50-75 (Greed): normal trading conditions
  - 75-100 (Extreme Greed): top-blow risk สูง → LONG confidence -10, SHORT confidence +5
• Funding Rate (8h, BTCUSDT perp):
  - > +0.05% (longs paying เยอะ): long squeeze risk → LONG confidence -10
  - > +0.10% (extreme): crowded longs → LONG → WAIT แทน
  - < -0.05%: short squeeze risk → SHORT confidence -10, LONG confidence +5
• BTC Dominance:
  - > 55% และกำลังขึ้น: alts underperform → SHORT alts ปลอดภัยกว่า
  - < 50% และกำลังลง: alt season → LONG alts ได้แต่ระวัง BTC ลง
- ระบุใน reasoning_th ด้วยว่า market context ส่งผลต่อ confidence อย่างไร`;

function buildUserPrompt(p: TradingViewPayload, ctx?: MarketContext): string {
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

  // Build macro context block if available — AI uses this to adjust confidence
  let macroBlock = "";
  if (ctx) {
    const lines: string[] = ["=== Macro / Market Context ==="];
    if (ctx.fearGreed) {
      lines.push(
        `Fear & Greed: ${ctx.fearGreed.value}/100 (${ctx.fearGreed.classification})`
      );
    } else {
      lines.push("Fear & Greed: - (unavailable)");
    }
    if (ctx.btcDominance) {
      lines.push(`BTC Dominance: ${ctx.btcDominance.value}%`);
    } else {
      lines.push("BTC Dominance: - (unavailable)");
    }
    if (ctx.funding) {
      const pct = (ctx.funding.rate * 100).toFixed(4);
      const tag =
        ctx.funding.rate > 0.0005
          ? " ⚠️ longs crowded"
          : ctx.funding.rate < -0.0005
          ? " ⚠️ shorts crowded"
          : " (neutral)";
      lines.push(`Funding Rate (8h): ${ctx.funding.rate >= 0 ? "+" : ""}${pct}%${tag}`);
    } else {
      lines.push("Funding Rate: - (unavailable)");
    }
    macroBlock = "\n\n" + lines.join("\n");
  }

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
หมายเหตุ: ${p.note ?? "-"}${macroBlock}

ตอบกลับเป็น JSON ตามรูปแบบนี้เท่านั้น:
{
  "checklist": {
    "trend_aligned": true | false,
    "volume_confirms": true | false,
    "rsi_in_zone": true | false,
    "rr_acceptable": true | false,
    "regime": "TRENDING" | "RANGING" | "VOLATILE"
  },
  "bias": "LONG" | "SHORT",
  "recommended": true | false,
  "recommendation_reason": "ถ้า recommended=false ใส่เหตุผลสั้นๆ ที่นี่ (ไม่เกิน 100 ตัวอักษร) เช่น 'ADX 18 ตลาด ranging' หรือ 'R:R 0.8 ต่ำกว่า 1'. ถ้า recommended=true ตอบ null หรือ ''",
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

ย้ำ:
- bias ต้องเป็น "LONG" หรือ "SHORT" เท่านั้น (ห้าม WAIT)
- entry/SL/TP1/TP2 ต้องเป็นตัวเลขเสมอ (ห้าม null) แม้ recommended=false
- recommended=false เมื่อ setup ไม่ดี — แต่ยังต้องตอบ direction + ราคาทุก field`;
}

// Post-Phase-2: AI should never return WAIT. If it does (legacy model, prompt
// drift) we coerce to a direction based on the Pine signal. WAIT is preserved
// as an option only for backward compat with stale rows in DB.
function coerceBias(v: unknown, pineSignal?: string): AIBias {
  const s = String(v ?? "").toUpperCase();
  if (s === "LONG" || s === "SHORT") return s;
  // AI returned WAIT / null / unknown — fall back to Pine signal direction
  const pine = String(pineSignal ?? "").toUpperCase();
  if (pine === "BUY"  || pine === "LONG")  return "LONG";
  if (pine === "SELL" || pine === "SHORT") return "SHORT";
  // Last resort: default to LONG (market has long bias on long timeframes)
  return "LONG";
}

function coerceBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").toLowerCase().trim();
  if (s === "true"  || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no")  return false;
  return fallback;
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

async function callOpenAi(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  apiKeyOverride?: string | null
): Promise<string> {
  const apiKey = apiKeyOverride ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing OPENAI_API_KEY — set it in /dashboard/schedule (admin) or as Firebase env var"
    );
  }

  const client = new OpenAI({ apiKey });

  // o1-* reasoning models reject the system role and response_format.
  // Detect and fall back to a single user message with JSON instructions.
  const isReasoningModel = /^o1|^o3/.test(model);

  if (isReasoningModel) {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "user", content: `${systemPrompt}\n\n${userPrompt}\n\nReturn JSON only.` },
      ],
    });
    return completion.choices[0]?.message?.content ?? "{}";
  }

  const completion = await client.chat.completions.create({
    model,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });
  return completion.choices[0]?.message?.content ?? "{}";
}

export async function analyzeCryptoSignal(
  payload: TradingViewPayload,
  modelId?: string
): Promise<{
  result: AIAnalysisResult;
  raw: unknown;
  model: string;
  provider: string;
  context: MarketContext;
}> {
  // Priority: explicit arg > env override > catalog default
  const targetModel = modelId || process.env.OPENAI_MODEL || DEFAULT_AI_MODEL;
  const provider = providerFor(targetModel);

  // Fetch macro context in parallel with key lookup so the AI sees Fear &
  // Greed + BTC.D + funding rate alongside the technical signal. Failures
  // are silent — the prompt just shows "unavailable".
  const [context, keys] = await Promise.all([
    getMarketContext(payload.symbol).catch(() => ({
      fearGreed: null,
      btcDominance: null,
      funding: null,
      fetchedAt: new Date().toISOString(),
      cached: false,
    } satisfies MarketContext)),
    getApiKeys(),
  ]);
  const userPrompt = buildUserPrompt(payload, context);

  // Resolve API key — DB key (admin-set) takes precedence over env vars.
  // getApiKeys() already handles the env fallback (called above).
  const apiKey = provider === "gemini" ? keys.gemini : keys.openai;

  let content: string;
  if (provider === "gemini") {
    content = await callGemini(targetModel, SYSTEM_PROMPT, userPrompt, 0, apiKey);
  } else {
    content = await callOpenAi(targetModel, SYSTEM_PROMPT, userPrompt, apiKey);
  }

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(content);
  } catch {
    // Some models wrap JSON in ```json ... ``` — strip and retry once
    const stripped = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();
    try {
      parsed = JSON.parse(stripped);
    } catch {
      throw new Error(`AI (${provider}/${targetModel}) returned non-JSON response`);
    }
  }

  // recommended defaults to true when AI provides a clear LONG/SHORT direction
  // and confidence ≥ 60. The pipeline can override this to false later based
  // on filter rules (blocked hour, vote disagree, etc.).
  const aiConfidence = coerceConfidence(parsed.confidence);
  const aiBias = coerceBias(parsed.bias, payload.signal);
  const recDefault = aiConfidence >= 60;
  const aiRecommended = coerceBool(parsed.recommended, recDefault);
  const recReasonRaw = parsed.recommendation_reason;
  const recReason =
    typeof recReasonRaw === "string" && recReasonRaw.trim().length > 0
      ? recReasonRaw.trim()
      : null;

  const result: AIAnalysisResult = {
    bias: aiBias,
    confidence: aiConfidence,
    recommended: aiRecommended,
    recommendation_reason: recReason,
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

  return { result, raw: parsed, model: targetModel, provider, context };
}

/** Output of a dual-model run. */
export interface DualAnalysisOutput {
  primary: {
    model: string;
    provider: string;
    result: AIAnalysisResult;
    raw: unknown;
  };
  secondary: {
    model: string;
    provider: string;
    result: AIAnalysisResult;
    raw: unknown;
  } | null;
  secondaryError?: string;
  context: MarketContext;
  agreement: {
    biasAgree: boolean;     // both LONG, both SHORT, or both WAIT
    confidenceDiff: number; // |primary - secondary|
  } | null;
}

/**
 * Runs primary AND secondary models in parallel. The primary's result is
 * always returned; the secondary is best-effort (a failure is captured but
 * does not break the pipeline). Callers decide whether to gate on agreement
 * via the `agreement` field (see ai_mode="vote" in webhook/process).
 *
 * Both calls share the same market context (fetched once, before the calls).
 */
export async function analyzeDualModel(
  payload: TradingViewPayload,
  primaryModel: string,
  secondaryModel: string
): Promise<DualAnalysisOutput> {
  const [p, s] = await Promise.allSettled([
    analyzeCryptoSignal(payload, primaryModel),
    analyzeCryptoSignal(payload, secondaryModel),
  ]);

  if (p.status === "rejected") {
    // If primary failed, surface the error — there's no fallback because
    // PENDING signals downstream need a primary verdict to act on.
    throw p.reason instanceof Error ? p.reason : new Error(String(p.reason));
  }

  const primary = p.value;
  const secondary = s.status === "fulfilled" ? s.value : null;
  const secondaryError =
    s.status === "rejected"
      ? s.reason instanceof Error
        ? s.reason.message
        : String(s.reason)
      : undefined;

  const agreement = secondary
    ? {
        biasAgree: primary.result.bias === secondary.result.bias,
        confidenceDiff: Math.abs(
          primary.result.confidence - secondary.result.confidence
        ),
      }
    : null;

  return {
    primary: {
      model: primary.model,
      provider: primary.provider,
      result: primary.result,
      raw: primary.raw,
    },
    secondary: secondary
      ? {
          model: secondary.model,
          provider: secondary.provider,
          result: secondary.result,
          raw: secondary.raw,
        }
      : null,
    secondaryError,
    context: primary.context,
    agreement,
  };
}
