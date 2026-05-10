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

function pctFromEntry(level: number, entry: number, bias: string): string {
  if (!entry || !Number.isFinite(level) || !Number.isFinite(entry)) return "";
  const raw = bias === "LONG"
    ? ((level - entry) / entry) * 100
    : ((entry - level) / entry) * 100;
  const sign = raw >= 0 ? "+" : "";
  return `${sign}${raw.toFixed(2)}%`;
}

function pickNumber(...candidates: unknown[]): number | null {
  for (const c of candidates) {
    if (c === null || c === undefined || c === "") continue;
    const n = typeof c === "number" ? c : Number(c);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function buildTelegramMessage(
  payload: TradingViewPayload,
  ai: AIAnalysisResult
): string {
  // Prefer numeric values from Pine payload (most accurate), fall back to AI numeric.
  const entryNum =
    pickNumber(payload.entry_low, payload.entry, payload.price) ??
    pickNumber(ai.entry_low) ??
    0;
  const slNum = pickNumber(
    payload.stop_loss,
    payload.sl,
    ai.stop_loss_num
  );
  const tp1Num = pickNumber(payload.tp1, payload.take_profit, ai.take_profit_1_num);
  const tp2Num = pickNumber(payload.tp2, ai.take_profit_2_num);

  // Render SL/TP rows: prefer numeric with % from entry, fall back to AI text.
  const slLine = slNum !== null
    ? `<b>${escapeHtml(fmtPrice(slNum))}</b> <i>(${pctFromEntry(slNum, entryNum, ai.bias)})</i>`
    : escapeHtml(ai.stop_loss);

  const tp1Line = tp1Num !== null
    ? `<b>${escapeHtml(fmtPrice(tp1Num))}</b> <i>(${pctFromEntry(tp1Num, entryNum, ai.bias)})</i>`
    : escapeHtml(ai.take_profit_1);

  const tp2Line = tp2Num !== null
    ? `<b>${escapeHtml(fmtPrice(tp2Num))}</b> <i>(${pctFromEntry(tp2Num, entryNum, ai.bias)})</i>`
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

  const lines: string[] = [
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
    escapeHtml(ai.reasoning_th),
    "",
    "⚠️ <i>หมายเหตุ: ข้อมูลนี้เป็นเพียงการวิเคราะห์เพื่อประกอบการตัดสินใจ ไม่ใช่คำแนะนำทางการเงิน</i>"
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
