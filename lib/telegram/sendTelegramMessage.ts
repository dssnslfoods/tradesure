import type { AIAnalysisResult, TradingViewPayload } from "@/types/signal";

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fmtPrice(v: string | number | undefined | null): string {
  if (v === null || v === undefined || v === "") return "-";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

export function buildTelegramMessage(
  payload: TradingViewPayload,
  ai: AIAnalysisResult
): string {
  const lines = [
    "🚨 <b>Crypto AI Signal Alert</b>",
    "",
    `เหรียญ: <b>${escapeHtml(payload.symbol)}</b>`,
    `Timeframe: <b>${escapeHtml(payload.interval)}</b>`,
    `Signal จาก TradingView: <b>${escapeHtml(payload.signal)}</b>`,
    `ราคา: <b>${escapeHtml(fmtPrice(payload.price))}</b>`,
    "",
    `📊 มุมมอง AI: <b>${escapeHtml(ai.bias)}</b>`,
    `ความมั่นใจ: <b>${ai.confidence}%</b>`,
    `ความเสี่ยง: <b>${escapeHtml(ai.risk_level)}</b>`,
    "",
    "🎯 <b>Entry Zone:</b>",
    escapeHtml(ai.entry_zone),
    "",
    "🛑 <b>Stop Loss:</b>",
    escapeHtml(ai.stop_loss),
    "",
    "✅ <b>Take Profit:</b>",
    `TP1: ${escapeHtml(ai.take_profit_1)}`,
    `TP2: ${escapeHtml(ai.take_profit_2)}`,
    "",
    "🧠 <b>สรุป:</b>",
    escapeHtml(ai.summary_th),
    "",
    "📝 <b>เหตุผล:</b>",
    escapeHtml(ai.reasoning_th),
    "",
    "⚠️ <i>หมายเหตุ: ข้อมูลนี้เป็นเพียงการวิเคราะห์เพื่อประกอบการตัดสินใจ ไม่ใช่คำแนะนำทางการเงิน</i>",
  ];
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
