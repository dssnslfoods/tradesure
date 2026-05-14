import type { AIAnalysisResult, TradingViewPayload } from "@/types/signal";
import type { MarketContext } from "@/lib/market/context";

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Phase 1a — small visual tag so users see which trading plan a message
// belongs to. We use Thai labels because the rest of the UI is Thai.
// Missing/unknown plan → "Swing" (legacy default).
function planTag(signalType: unknown): string {
  return signalType === "intraday"
    ? "🟣 <b>[Intraday]</b>"
    : "🔵 <b>[Swing]</b>";
}

function fmtPrice(v: string | number | undefined | null): string {
  if (v === null || v === undefined || v === "") return "-";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

function pctFromEntry(level: number, entry: number, direction: "LONG" | "SHORT"): string {
  if (!entry || !Number.isFinite(level) || !Number.isFinite(entry)) return "";
  const raw =
    direction === "LONG"
      ? ((level - entry) / entry) * 100
      : ((entry - level) / entry) * 100;
  const sign = raw >= 0 ? "+" : "";
  return `${sign}${raw.toFixed(2)}%`;
}

// Resolve trade direction even when AI returns WAIT.
function resolveDirection(payload: TradingViewPayload, aiBias: string): "LONG" | "SHORT" {
  if (aiBias === "LONG") return "LONG";
  if (aiBias === "SHORT") return "SHORT";
  // AI said WAIT — fall back to TradingView signal
  const sig = String(payload.signal ?? "").toUpperCase();
  if (sig === "BUY" || sig === "LONG") return "LONG";
  if (sig === "SELL" || sig === "SHORT") return "SHORT";
  return "LONG";
}

function pickNumber(...candidates: unknown[]): number | null {
  for (const c of candidates) {
    if (c === null || c === undefined || c === "") continue;
    const n = typeof c === "number" ? c : Number(c);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

// Renders a 3-line market-context block. Returns "" if all three metrics are
// unavailable so callers don't get a stray header.
function renderMarketContext(ctx: unknown): string[] {
  const c = ctx as MarketContext | null | undefined;
  if (!c) return [];
  const lines: string[] = [];
  if (c.fearGreed) {
    const emoji =
      c.fearGreed.value < 25 ? "😱"
      : c.fearGreed.value < 50 ? "😨"
      : c.fearGreed.value < 75 ? "😐"
      : "🤑";
    lines.push(`${emoji} Fear & Greed: <b>${c.fearGreed.value}</b> (${escapeHtml(c.fearGreed.classification)})`);
  }
  if (c.btcDominance) {
    lines.push(`₿ BTC Dominance: <b>${c.btcDominance.value}%</b>`);
  }
  if (c.funding) {
    const pct = (c.funding.rate * 100).toFixed(4);
    const sign = c.funding.rate >= 0 ? "+" : "";
    const tag =
      c.funding.rate > 0.0005 ? " ⚠️ longs crowded"
      : c.funding.rate < -0.0005 ? " ⚠️ shorts crowded"
      : "";
    lines.push(`💸 Funding (8h): <b>${sign}${pct}%</b>${tag}`);
  }
  if (lines.length === 0) return [];
  return ["📊 <b>Market Context</b>", ...lines];
}

interface SecondOpinion {
  secondary: {
    model: string;
    provider: string;
    result: AIAnalysisResult;
  } | null;
  agreement: { biasAgree: boolean; confidenceDiff: number } | null;
}

function renderSecondOpinion(opt: SecondOpinion | undefined): string[] {
  if (!opt?.secondary) return [];
  const s = opt.secondary;
  const a = opt.agreement;
  const verdict = a?.biasAgree ? "✅ agree" : "❌ disagree";
  const lines: string[] = [
    `🤝 <b>Second opinion (${escapeHtml(s.model)})</b> — ${verdict}`,
    `Bias: <b>${escapeHtml(s.result.bias)}</b> · Confidence: <b>${s.result.confidence}%</b> · Risk: ${escapeHtml(s.result.risk_level)}`,
    `<i>${escapeHtml(s.result.summary_th)}</i>`,
  ];
  if (a && !a.biasAgree) {
    lines.push(`⚠️ <b>Models disagree</b> — เทรดด้วยความระมัดระวัง`);
  } else if (a && a.confidenceDiff > 20) {
    lines.push(`⚠️ confidence ต่างกัน <b>${a.confidenceDiff}pts</b>`);
  }
  return lines;
}

export function buildTelegramMessage(
  payload: TradingViewPayload,
  ai: AIAnalysisResult,
  ctx?: unknown,
  secondOpinion?: SecondOpinion
): string {
  // Prefer numeric values from Pine payload (most accurate), fall back to AI numeric.
  // For % computation we use the signal price (the actual fill reference)
  // rather than the lower bound of the entry zone, otherwise % can flip sign.
  const entryNum =
    pickNumber(payload.price, payload.entry) ??
    (pickNumber(payload.entry_low) !== null && pickNumber(payload.entry_high) !== null
      ? (pickNumber(payload.entry_low)! + pickNumber(payload.entry_high)!) / 2
      : null) ??
    pickNumber(ai.entry_low) ??
    0;
  const slNum = pickNumber(
    payload.stop_loss,
    payload.sl,
    ai.stop_loss_num
  );
  const tp1Num = pickNumber(payload.tp1, payload.take_profit, ai.take_profit_1_num);
  const tp2Num = pickNumber(payload.tp2, ai.take_profit_2_num);

  const direction = resolveDirection(payload, ai.bias);

  // Render SL/TP rows: prefer numeric with % from entry, fall back to AI text.
  const slLine = slNum !== null
    ? `<b>${escapeHtml(fmtPrice(slNum))}</b> <i>(${pctFromEntry(slNum, entryNum, direction)})</i>`
    : escapeHtml(ai.stop_loss);

  const tp1Line = tp1Num !== null
    ? `<b>${escapeHtml(fmtPrice(tp1Num))}</b> <i>(${pctFromEntry(tp1Num, entryNum, direction)})</i>`
    : escapeHtml(ai.take_profit_1);

  const tp2Line = tp2Num !== null
    ? `<b>${escapeHtml(fmtPrice(tp2Num))}</b> <i>(${pctFromEntry(tp2Num, entryNum, direction)})</i>`
    : escapeHtml(ai.take_profit_2);

  // Risk:Reward (using TP1)
  let rrLine = "";
  if (slNum !== null && tp1Num !== null && entryNum) {
    const risk = Math.abs(entryNum - slNum);
    const reward = Math.abs(tp1Num - entryNum);
    if (risk > 0) {
      rrLine = `R:R (TP1): <b>${(reward / risk).toFixed(2)}:1</b>`;
    }
  }

  const isWait = ai.bias === "WAIT";
  const contextLines = renderMarketContext(ctx);
  const secondOpinionLines = renderSecondOpinion(secondOpinion);

  // ============= WAIT message: clear NO TRADE banner, no levels =============
  if (isWait) {
    const lines: string[] = [
      `${planTag(payload.signal_type)} ⛔ <b>NO TRADE — ไม่แนะนำให้เข้า</b>`,
      "━━━━━━━━━━━━━━━━━━━━",
      "",
      `เหรียญ: <b>${escapeHtml(payload.symbol)}</b>`,
      `Timeframe: <b>${escapeHtml(payload.interval)}</b>`,
      `Signal จาก TradingView: <b>${escapeHtml(payload.signal)}</b>`,
      `ราคาปัจจุบัน: <b>${escapeHtml(fmtPrice(payload.price))}</b>`,
      "",
      "📊 <b>มุมมอง AI: WAIT</b>",
      `ความมั่นใจ: <b>${ai.confidence}%</b>`,
      `ความเสี่ยง: <b>${escapeHtml(ai.risk_level)}</b>`,
      "",
      "🚫 <b>เหตุผลที่ไม่แนะนำ:</b>",
      escapeHtml(ai.summary_th),
      "",
      "📝 <b>รายละเอียด:</b>",
      escapeHtml(ai.reasoning_th),
    ];
    if (secondOpinionLines.length > 0) {
      lines.push("", ...secondOpinionLines);
    }
    if (contextLines.length > 0) {
      lines.push("", ...contextLines);
    }
    lines.push(
      "",
      "💡 <i>รอสัญญาณที่ชัดเจนกว่านี้</i>",
      "",
      "━━━━━━━━━━━━━━━━━━━━",
      "⚠️ <i>หมายเหตุ: ข้อมูลนี้เป็นเพียงการวิเคราะห์เพื่อประกอบการตัดสินใจ ไม่ใช่คำแนะนำทางการเงิน</i>"
    );
    return lines.join("\n");
  }

  // ============= LONG/SHORT message: full trade plan =============
  const lines: string[] = [
    `${planTag(payload.signal_type)} 🚨 <b>Crypto AI Signal Alert</b>`,
    "",
    `เหรียญ: <b>${escapeHtml(payload.symbol)}</b>`,
    `Timeframe: <b>${escapeHtml(payload.interval)}</b>`,
    `Signal จาก TradingView: <b>${escapeHtml(payload.signal)}</b>`,
    `ราคา: <b>${escapeHtml(fmtPrice(payload.price))}</b>`,
    "",
    `📊 มุมมอง AI: <b>${escapeHtml(ai.bias)}</b>`,
    `ความมั่นใจ: <b>${ai.confidence}%</b>`,
    `ความเสี่ยง: <b>${escapeHtml(ai.risk_level)}</b>`,
  ];
  if (rrLine) lines.push(rrLine);
  lines.push(
    "",
    "🎯 <b>Entry Zone:</b>",
    escapeHtml(ai.entry_zone),
    "",
    "🛑 <b>Stop Loss:</b>",
    slLine,
    "",
    "✅ <b>Take Profit:</b>",
    `TP1: ${tp1Line}`,
    `TP2: ${tp2Line}`,
    "",
    "🧠 <b>สรุป:</b>",
    escapeHtml(ai.summary_th),
    "",
    "📝 <b>เหตุผล:</b>",
    escapeHtml(ai.reasoning_th)
  );
  if (secondOpinionLines.length > 0) {
    lines.push("", ...secondOpinionLines);
  }
  if (contextLines.length > 0) {
    lines.push("", ...contextLines);
  }
  lines.push(
    "",
    "⚠️ <i>หมายเหตุ: ข้อมูลนี้เป็นเพียงการวิเคราะห์เพื่อประกอบการตัดสินใจ ไม่ใช่คำแนะนำทางการเงิน</i>"
  );
  return lines.join("\n");
}

// ─── NO_TRADE message ──────────────────────────────────────────────────────
// Sent every candle close when none of the trade conditions are met. Lets the
// user know the bot is alive and *why* it is staying flat.
interface NoTradePayload {
  symbol?: string;
  interval?: string;
  price?: string | number;
  time?: string | number;
  hour_bkk?: string | number;
  signal_type?: string;
  rsi?: string | number;
  adx?: string | number;
  atr_pct?: string | number;
  volume?: string | number;
  volume_ma?: string | number;
  reasons?: {
    no_cross?: boolean;
    weak_trend?: boolean;
    low_volume?: boolean;
    dead_market?: boolean;
    blocked_hour?: boolean;
    cooldown?: boolean;
    rsi_out?: boolean;
    htf_misalign?: boolean;
    daily_misalign?: boolean;
  };
}

const REASON_LABELS_TH: Record<keyof NonNullable<NoTradePayload["reasons"]>, string> = {
  no_cross:       "ไม่มี EMA cross (รอ setup)",
  weak_trend:     "ADX ต่ำ (เทรนด์อ่อน)",
  low_volume:     "Volume ไม่พอ",
  dead_market:    "ATR% ต่ำ (ตลาดเงียบ)",
  blocked_hour:   "ชั่วโมงที่ block (win rate ต่ำในอดีต)",
  cooldown:       "อยู่ในช่วง cooldown หลัง signal ล่าสุด",
  rsi_out:        "RSI อยู่นอกโซนเข้า",
  htf_misalign:   "Higher-TF trend ไม่สอดคล้อง",
  daily_misalign: "ทิศ signal สวน Daily trend (regime gate)",
};

function fmtBangkokTime(t: string | number | undefined): string {
  if (t === undefined || t === null || t === "") return "-";
  const ms = typeof t === "number" ? t : Number(t);
  const d = Number.isFinite(ms) ? new Date(ms) : new Date(String(t));
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
    hour12: false,
  });
}

export function buildNoTradeMessage(payload: NoTradePayload): string {
  const reasons = payload.reasons ?? {};
  const activeReasons = (Object.keys(REASON_LABELS_TH) as (keyof typeof REASON_LABELS_TH)[])
    .filter((k) => reasons[k] === true)
    .map((k) => `• ${REASON_LABELS_TH[k]}`);
  // Fallback if Pine didn't flag anything specific
  if (activeReasons.length === 0) activeReasons.push("• ไม่เข้าเงื่อนไขเทรด (รอ setup ที่ดีกว่า)");

  const symbol = payload.symbol ?? "-";
  const interval = payload.interval ? `${payload.interval}m` : "";
  const priceStr = fmtPrice(payload.price);

  const vol = Number(payload.volume);
  const volMa = Number(payload.volume_ma);
  const volRatio =
    Number.isFinite(vol) && Number.isFinite(volMa) && volMa > 0
      ? `${(vol / volMa).toFixed(2)}×`
      : "-";

  const adxStr = payload.adx !== undefined ? Number(payload.adx).toFixed(1) : "-";
  const rsiStr = payload.rsi !== undefined ? Number(payload.rsi).toFixed(1) : "-";
  const atrPctStr = payload.atr_pct !== undefined ? Number(payload.atr_pct).toFixed(2) : "-";

  return [
    `${planTag(payload.signal_type)} 🟡 <b>NO TRADE</b> — ${escapeHtml(symbol)} ${escapeHtml(interval)}`,
    `⏰ ${fmtBangkokTime(payload.time)} (BKK)`,
    "",
    "<b>ไม่เข้าเงื่อนไขเทรด:</b>",
    activeReasons.map(escapeHtml).join("\n"),
    "",
    `📊 ราคา: $${priceStr}`,
    `<code>ADX ${adxStr} · RSI ${rsiStr} · ATR ${atrPctStr}% · Vol ${volRatio}</code>`,
    "",
    "<i>(ข้อความนี้ส่งทุกชั่วโมงเพื่อยืนยันว่า bot ทำงานปกติ)</i>",
  ].join("\n");
}

// ─── Configuration broadcast ──────────────────────────────────────────────
// Admin "Test broadcast" doubles as a system-status announcement: every
// active recipient gets a snapshot of the current setup so they know what
// the bot is doing right now (which AI model, which schedule, which filters).
export interface ConfigBroadcastInput {
  // From BacktestScheduleConfig
  schedulerEnabled: boolean;
  pauseReason: string | null;
  intervalMinutes: number;
  cardRetentionDays: number;

  // AI
  aiModel: string;
  aiMode: "single" | "compare" | "vote";
  aiModelSecondary: string;
  primaryProviderLabel: string;       // e.g., "OpenAI", "Google"
  secondaryProviderLabel: string;

  // API keys (configured status only — no plaintext)
  openaiKeyConfigured: boolean;
  openaiKeySource: "db" | "env" | "none";
  geminiKeyConfigured: boolean;
  geminiKeySource: "db" | "env" | "none";

  // Schedule
  aiActiveNow: boolean;
  aiActiveWindowsSummary: string;     // pre-formatted by caller
  aiActiveDaysSummary: string;        // pre-formatted by caller

  // Filters / env
  minConfidence: string;
  blockedHours: string;
  notradeTelegram: string;

  // Connections
  telegramContactCount: number;
  totalSignals: number;
  queuedCount: number;
}

export function buildConfigBroadcastMessage(c: ConfigBroadcastInput): string {
  const ts = new Date().toLocaleString("en-GB", {
    timeZone: "Asia/Bangkok",
    hour12: false,
  });

  const statusEmoji = c.schedulerEnabled ? "🟢" : "🟡";
  const aiNowEmoji = c.aiActiveNow ? "🟢 active" : "🟡 idle";

  const keyStatus = (configured: boolean, source: string) => {
    if (!configured) return "❌ <i>not set</i>";
    return source === "db" ? "✅ <code>DB</code>" : "✅ <code>ENV</code>";
  };

  const modeLabel = c.aiMode === "vote"
    ? "🤝 Vote (consensus)"
    : c.aiMode === "compare"
    ? "🔀 Compare (parallel)"
    : "🎯 Single";

  const lines: string[] = [
    "📢 <b>System Status Update</b>",
    "━━━━━━━━━━━━━━━━━━━━",
    `<i>Snapshot at ${ts} (BKK)</i>`,
    "",
    `${statusEmoji} <b>System</b>: ${c.schedulerEnabled ? "ACTIVE" : "PAUSED"}`,
  ];
  if (!c.schedulerEnabled && c.pauseReason) {
    lines.push(`   Reason: ${escapeHtml(c.pauseReason)}`);
  }
  lines.push(
    `📊 <b>Signals tracked</b>: ${c.totalSignals.toLocaleString()}`,
    `📥 <b>Queue</b>: ${c.queuedCount} awaiting AI`,
    "",
    "🤖 <b>AI Engine</b>",
    `   Mode: ${modeLabel}`,
    `   Primary: <code>${escapeHtml(c.aiModel)}</code> (${escapeHtml(c.primaryProviderLabel)})`,
  );
  if (c.aiMode !== "single") {
    lines.push(
      `   Secondary: <code>${escapeHtml(c.aiModelSecondary)}</code> (${escapeHtml(c.secondaryProviderLabel)})`
    );
  }
  lines.push(
    "",
    "🔑 <b>API Keys</b>",
    `   OpenAI: ${keyStatus(c.openaiKeyConfigured, c.openaiKeySource)}`,
    `   Gemini: ${keyStatus(c.geminiKeyConfigured, c.geminiKeySource)}`,
    "",
    "📅 <b>AI Schedule</b>",
    `   Status: ${aiNowEmoji}`,
    `   Windows: <code>${escapeHtml(c.aiActiveWindowsSummary)}</code>`,
    `   Days: <code>${escapeHtml(c.aiActiveDaysSummary)}</code>`,
    "",
    "⚙️ <b>Quality Filters</b>",
    `   Min confidence: <b>${escapeHtml(c.minConfidence)}%</b>`,
    `   Blocked hours (BKK): <code>${escapeHtml(c.blockedHours || "none")}</code>`,
    `   NO_TRADE Telegram: ${c.notradeTelegram === "0" ? "OFF" : "ON"}`,
    `   Card retention: ${c.cardRetentionDays} days`,
    "",
    "🔌 <b>Connections</b>",
    `   Active Telegram contacts: ${c.telegramContactCount}`,
    "",
    "━━━━━━━━━━━━━━━━━━━━",
    "<i>ระบบส่ง snapshot นี้เมื่อ admin กดทดสอบ — เพื่อให้ทุกคนเห็นว่า bot กำลังตั้งค่าไว้แบบไหน</i>"
  );

  return lines.join("\n");
}

export async function sendTelegramToChat(
  chatId: string,
  message: string
): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: "Missing TELEGRAM_BOT_TOKEN" };
  if (!chatId) return { ok: false, error: "Missing chat_id" };

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `Telegram HTTP ${res.status}: ${text.slice(0, 300)}` };
    }
    const data: unknown = await res.json();
    if (typeof data === "object" && data && "ok" in data && (data as { ok: boolean }).ok) {
      return { ok: true };
    }
    return { ok: false, error: `Telegram response not ok: ${JSON.stringify(data).slice(0, 300)}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown telegram error" };
  }
}

// Broadcast a signal-style alert to every active auth_user's Telegram
// chat plus the env TELEGRAM_CHAT_ID (which may be a shared channel or
// the original admin chat). De-duplicates by chat_id so admins linked
// to TELEGRAM_CHAT_ID don't get the same message twice.
export async function broadcastTelegramMessage(message: string): Promise<{
  ok: boolean;
  sent: number;
  failed: number;
  errors: string[];
}> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const envChatId = process.env.TELEGRAM_CHAT_ID;
  if (!token) {
    return { ok: false, sent: 0, failed: 0, errors: ["Missing TELEGRAM_BOT_TOKEN"] };
  }

  const chatIds = new Set<string>();
  if (envChatId) chatIds.add(envChatId);

  // Pull active users from DB
  try {
    const { getSupabaseAdmin } = await import("@/lib/supabase/server");
    const supabase = getSupabaseAdmin();
    const { data: users } = await supabase
      .from("auth_users")
      .select("telegram_chat_id")
      .eq("is_active", true);
    (users ?? []).forEach((u: { telegram_chat_id: string | null }) => {
      if (u.telegram_chat_id) chatIds.add(u.telegram_chat_id);
    });
  } catch {
    // If DB lookup fails, fall back to env-only
  }

  if (chatIds.size === 0) {
    return { ok: false, sent: 0, failed: 0, errors: ["No recipients configured"] };
  }

  const results = await Promise.all(
    [...chatIds].map(async (cid) => {
      const r = await sendTelegramToChat(cid, message);
      return { chatId: cid, ...r };
    })
  );

  const sent = results.filter((r) => r.ok).length;
  const failed = results.length - sent;
  const errors = results.filter((r) => !r.ok).map((r) => `${r.chatId}: ${r.error}`);

  return { ok: sent > 0, sent, failed, errors };
}

export async function sendTelegramMessage(message: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return { ok: false, error: "Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID" };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `Telegram HTTP ${res.status}: ${text.slice(0, 300)}` };
    }
    const data: unknown = await res.json();
    if (typeof data === "object" && data && "ok" in data && (data as { ok: boolean }).ok) {
      return { ok: true };
    }
    return { ok: false, error: `Telegram response not ok: ${JSON.stringify(data).slice(0, 300)}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown telegram error" };
  }
}
