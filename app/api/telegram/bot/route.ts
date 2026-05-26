import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  sendTelegramToChat,
  sendTelegramWithKeyboard,
  editTelegramMessage,
  answerCallbackQuery,
  buildTelegramMessage,
  type InlineButton,
} from "@/lib/telegram/sendTelegramMessage";
import {
  getScheduleConfig,
  getTradingPlansCatalog,
} from "@/lib/schedule/settings";
import { findModel } from "@/lib/ai/models";
import { analyzeCryptoSignal, analyzeDualModel } from "@/lib/ai/analyzeCryptoSignal";
import {
  computeSymbolIndicators,
  normalizeSymbol,
  planInterval,
} from "@/lib/binance/indicators";
import type { TradingViewPayload } from "@/types/signal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ─── Telegram update types ─────────────────────────────────────────────────
interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}
interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: { id: number; type: string; first_name?: string; last_name?: string; username?: string };
  date: number;
  text?: string;
}
interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}
interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export async function GET() {
  return NextResponse.json({ ok: true, message: "Telegram bot webhook" });
}

// ─── Access control ────────────────────────────────────────────────────────
// Admins (auth_users.is_admin with this chat_id) are always allowed. Other
// contacts need telegram_contacts.ai_chat_enabled = true.
async function canUseAiChat(chatId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  // 1. Registered user by chat_id — admin always allowed; others need their
  //    own ai_chat_enabled flag (managed from the Auth users table).
  const { data: user } = await supabase
    .from("auth_users")
    .select("is_admin, ai_chat_enabled")
    .eq("telegram_chat_id", chatId)
    .eq("is_active", true)
    .maybeSingle();
  if (user?.is_admin) return true;
  if (user?.ai_chat_enabled === true) return true;
  // 2. Fallback for not-yet-registered contacts.
  const { data: contact } = await supabase
    .from("telegram_contacts")
    .select("ai_chat_enabled")
    .eq("chat_id", chatId)
    .maybeSingle();
  return contact?.ai_chat_enabled === true;
}

// ─── Build model picker buttons from admin Settings ────────────────────────
async function modelButtons(symbol: string, planKey: string): Promise<InlineButton[][]> {
  const cfg = await getScheduleConfig().catch(() => null);
  const primary = cfg?.ai_model ?? "gpt-4o-mini";
  const secondary = cfg?.ai_model_secondary ?? "gemini-2.5-flash";
  const primaryLabel = findModel(primary)?.label ?? primary;
  const secondaryLabel = findModel(secondary)?.label ?? secondary;

  const rows: InlineButton[][] = [];
  const top: InlineButton[] = [
    { text: `⚡ ${primaryLabel}`, callback_data: `md:${symbol}:${planKey}:${primary}` },
  ];
  if (secondary && secondary !== primary) {
    top.push({ text: `💎 ${secondaryLabel}`, callback_data: `md:${symbol}:${planKey}:${secondary}` });
  }
  rows.push(top);
  // Compare only meaningful when two distinct models exist
  if (secondary && secondary !== primary) {
    rows.push([{ text: "🔀 เทียบทั้งคู่ (Compare)", callback_data: `md:${symbol}:${planKey}:__compare__` }]);
  }
  return rows;
}

// ─── Plan picker buttons from active catalog plans ─────────────────────────
async function planButtons(symbol: string): Promise<InlineButton[][]> {
  const [cfg, catalog] = await Promise.all([
    getScheduleConfig().catch(() => null),
    getTradingPlansCatalog().catch(() => []),
  ]);
  const active = new Set(cfg?.active_trading_plans ?? ["swing"]);
  const usable = catalog.filter((p) => active.has(p.key));
  const pool = usable.length > 0 ? usable : catalog;
  // 2 buttons per row
  const rows: InlineButton[][] = [];
  for (let i = 0; i < pool.length; i += 2) {
    rows.push(
      pool.slice(i, i + 2).map((p) => ({
        text: `${p.emoji} ${p.label}`,
        callback_data: `pl:${symbol}:${p.key}`,
      }))
    );
  }
  return rows;
}

// ─── Run the analysis and format the reply ─────────────────────────────────
async function runAnalysis(symbol: string, planKey: string, modelId: string): Promise<string> {
  const ind = await computeSymbolIndicators(symbol, planKey);
  if (!ind) {
    return `❌ ไม่พบข้อมูล <b>${symbol}</b> บน Binance — เช็คชื่อเหรียญอีกครั้ง (เช่น BTCUSDT, ETHUSDT)`;
  }

  // Synthetic payload — same shape Pine would send, minus the entry/SL/TP
  // (AI computes those from price + ATR per the always-direction prompt).
  const payload: TradingViewPayload = {
    symbol,
    exchange: "BINANCE",
    interval: ind.interval,
    price: ind.price,
    time: String(Date.now()),
    signal: "ON_DEMAND",
    signal_type: planKey,
    rsi: ind.rsi ?? undefined,
    atr: ind.atr ?? undefined,
    atr_pct: ind.atrPct ?? undefined,
    ema_fast: ind.emaFast ?? undefined,
    ema_slow: ind.emaSlow ?? undefined,
    trend_ema: ind.emaTrend ?? undefined,
    daily_ema: ind.dailyEma200 ?? undefined,
    volume: ind.volume ?? undefined,
    volume_ma: ind.volumeMa ?? undefined,
  } as TradingViewPayload;

  const header = `📲 <b>On-demand analysis</b> · ${symbol} · ${planInterval(planKey)}\n━━━━━━━━━━━━━━━━━━━━\n`;

  if (modelId === "__compare__") {
    const cfg = await getScheduleConfig().catch(() => null);
    const primary = cfg?.ai_model ?? "gpt-4o-mini";
    const secondary = cfg?.ai_model_secondary ?? "gemini-2.5-flash";
    const dual = await analyzeDualModel(payload, primary, secondary);
    return (
      header +
      buildTelegramMessage(payload, dual.primary.result, dual.context, {
        secondary: dual.secondary
          ? {
              model: dual.secondary.model,
              provider: dual.secondary.provider,
              result: dual.secondary.result,
            }
          : null,
        agreement: dual.agreement,
      })
    );
  }

  const { result, context } = await analyzeCryptoSignal(payload, modelId);
  return header + buildTelegramMessage(payload, result, context);
}

// ─── Callback query handler (button taps) ──────────────────────────────────
async function handleCallback(cb: TelegramCallbackQuery): Promise<NextResponse> {
  const chatId = String(cb.message?.chat.id ?? cb.from.id);
  const messageId = cb.message?.message_id;
  const data = cb.data ?? "";

  if (!(await canUseAiChat(chatId))) {
    await answerCallbackQuery(cb.id, "ไม่มีสิทธิ์ใช้ฟีเจอร์นี้");
    return NextResponse.json({ ok: true });
  }

  const parts = data.split(":");
  const kind = parts[0];

  // Plan chosen → show model picker
  if (kind === "pl" && parts.length >= 3) {
    const symbol = parts[1];
    const planKey = parts.slice(2).join(":"); // plan keys can't contain ':' but be safe
    await answerCallbackQuery(cb.id);
    const rows = await modelButtons(symbol, planKey);
    const text = `🤖 เลือก AI model สำหรับ <b>${symbol}</b> (${planInterval(planKey)})`;
    if (messageId) {
      await editTelegramMessage(chatId, messageId, text, rows);
    } else {
      await sendTelegramWithKeyboard(chatId, text, rows);
    }
    return NextResponse.json({ ok: true });
  }

  // Model chosen → run analysis
  if (kind === "md" && parts.length >= 4) {
    const symbol = parts[1];
    const planKey = parts[2];
    const modelId = parts.slice(3).join(":");
    await answerCallbackQuery(cb.id, "กำลังวิเคราะห์...");
    const modelLabel =
      modelId === "__compare__" ? "Compare ทั้งคู่" : findModel(modelId)?.label ?? modelId;
    if (messageId) {
      await editTelegramMessage(
        chatId,
        messageId,
        `⏳ กำลังวิเคราะห์ <b>${symbol}</b> (${planInterval(planKey)}) ด้วย ${modelLabel}...`
      );
    }
    try {
      const reply = await runAnalysis(symbol, planKey, modelId);
      await sendTelegramToChat(chatId, reply);
    } catch (err) {
      await sendTelegramToChat(
        chatId,
        `❌ วิเคราะห์ไม่สำเร็จ: ${err instanceof Error ? err.message : "unknown error"}`
      );
    }
    return NextResponse.json({ ok: true });
  }

  await answerCallbackQuery(cb.id);
  return NextResponse.json({ ok: true });
}

// ─── Detect whether a free-text message is a symbol query ──────────────────
// Common non-symbol words to ignore when scanning a phrase for a ticker.
const STOPWORDS = new Set([
  "analyze", "analyse", "check", "ดู", "วิเคราะห์", "ขอ", "หน่อย", "ครับ",
  "ค่ะ", "please", "pls", "the", "a", "an", "now", "ตอนนี้", "เหรียญ",
  "coin", "signal", "สัญญาณ", "ราคา", "price", "buy", "sell", "long", "short",
]);

// Case-insensitive symbol extraction. Handles:
//   "btc"  "BTCUSDT"  "Eth"            → single token
//   "/analyze sol"  "/a BTC"           → command
//   "ดู btc หน่อย"  "analyze ETHUSDT"  → token inside a phrase
function parseSymbolQuery(text: string): string | null {
  const t = text.trim();
  if (!t) return null;

  // /analyze <x> or /a <x>
  if (t.startsWith("/")) {
    const m = t.match(/^\/(?:analyze|a)\s+(.+)$/i);
    if (m) return normalizeSymbol(m[1]);
    return null;
  }

  // Whole message is a single alphanumeric token (any case)
  if (/^[A-Za-z0-9]{2,20}$/.test(t)) return normalizeSymbol(t);

  // Otherwise scan the phrase for a likely ticker token. Prefer a token that
  // already ends in USDT/USD; else fall back to the first non-stopword
  // alphabetic token of length 2-10.
  const tokens = t.split(/[\s,]+/).filter(Boolean);
  const usdtToken = tokens.find((w) => /^[A-Za-z]{2,15}(USDT|USD)$/i.test(w));
  if (usdtToken) return normalizeSymbol(usdtToken);

  const candidate = tokens.find(
    (w) => /^[A-Za-z]{2,10}$/.test(w) && !STOPWORDS.has(w.toLowerCase())
  );
  if (candidate) return normalizeSymbol(candidate);

  return null;
}

export async function POST(req: NextRequest) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expectedSecret) {
    const got = req.headers.get("x-telegram-bot-api-secret-token");
    if (got !== expectedSecret) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  // ── Callback query (inline-keyboard tap) ──
  if (update.callback_query) {
    return handleCallback(update.callback_query);
  }

  const msg = update.message ?? update.edited_message;
  if (!msg) return NextResponse.json({ ok: true, ignored: true });

  const chatId = String(msg.chat.id);
  const from = msg.from ?? {
    id: msg.chat.id,
    first_name: msg.chat.first_name,
    last_name: msg.chat.last_name,
    username: msg.chat.username,
  };
  const text = msg.text ?? "";

  const supabase = getSupabaseAdmin();

  // Auto-link to an existing auth_user with the same chat_id, if any.
  const { data: matchingUser } = await supabase
    .from("auth_users")
    .select("id")
    .eq("telegram_chat_id", chatId)
    .eq("is_active", true)
    .maybeSingle();
  const linkedUserId = matchingUser?.id ?? null;

  // Upsert contact + bump counters.
  const nowIso = new Date().toISOString();
  const { data: existing } = await supabase
    .from("telegram_contacts")
    .select("id, message_count, registered_user_id")
    .eq("chat_id", chatId)
    .maybeSingle();

  let alreadyRegistered = false;
  if (existing) {
    alreadyRegistered = existing.registered_user_id !== null || linkedUserId !== null;
    await supabase
      .from("telegram_contacts")
      .update({
        username: from.username ?? null,
        first_name: from.first_name ?? null,
        last_name: from.last_name ?? null,
        language_code: from.language_code ?? null,
        is_bot: from.is_bot ?? false,
        last_message_text: text.slice(0, 500),
        message_count: (existing.message_count ?? 0) + 1,
        last_seen_at: nowIso,
        ...(existing.registered_user_id === null && linkedUserId
          ? { registered_user_id: linkedUserId }
          : {}),
      })
      .eq("id", existing.id);
  } else {
    alreadyRegistered = linkedUserId !== null;
    await supabase.from("telegram_contacts").insert({
      chat_id: chatId,
      username: from.username ?? null,
      first_name: from.first_name ?? null,
      last_name: from.last_name ?? null,
      language_code: from.language_code ?? null,
      is_bot: from.is_bot ?? false,
      last_message_text: text.slice(0, 500),
      registered_user_id: linkedUserId,
      first_seen_at: nowIso,
      last_seen_at: nowIso,
    });
  }

  // ── On-demand analysis flow ──
  const symbol = parseSymbolQuery(text);
  if (symbol) {
    if (await canUseAiChat(chatId)) {
      const rows = await planButtons(symbol);
      const promptText = `📊 วิเคราะห์ <b>${symbol}</b> — เลือก trading plan:`;
      await sendTelegramWithKeyboard(chatId, promptText, rows).catch(() => null);
      return NextResponse.json({ ok: true, flow: "ai_chat" });
    }
    // No access → tell them how to get it
    await sendTelegramToChat(
      chatId,
      [
        `🔒 ฟีเจอร์วิเคราะห์ AI ยังไม่เปิดให้บัญชีนี้`,
        "",
        `Chat ID: <code>${chatId}</code>`,
        "กรุณาแจ้ง admin เพื่อขอเปิดสิทธิ์ (พร้อมแนบ Chat ID)",
      ].join("\n")
    ).catch(() => null);
    return NextResponse.json({ ok: true, flow: "ai_chat_denied" });
  }

  // ── Default welcome / status reply ──
  const displayName = from.first_name ?? from.username ?? "ผู้ใช้";
  const helpLine = (await canUseAiChat(chatId))
    ? "\n\n💡 พิมพ์ชื่อเหรียญ (เช่น <code>BTCUSDT</code>) เพื่อขอวิเคราะห์ AI"
    : "";
  let reply: string;
  if (alreadyRegistered) {
    reply = [
      `สวัสดี ${displayName} 👋`,
      "",
      `Chat ID ของคุณ: <code>${chatId}</code>`,
      "",
      "✅ บัญชีของคุณได้รับสิทธิ์เข้าใช้ระบบแล้ว",
      'เปิด <a href="https://tradesure.d2infinite.com/login">tradesure.d2infinite.com</a> เพื่อเข้าสู่ระบบ',
      helpLine,
    ].join("\n");
  } else {
    reply = [
      `สวัสดี ${displayName} 👋`,
      "",
      `Chat ID ของคุณ: <code>${chatId}</code>`,
      "",
      "📥 ระบบบันทึกข้อมูลของคุณแล้ว",
      "กรุณารอ admin อนุมัติเพื่อเข้าใช้งานระบบ Tradesure",
      "",
      `<i>กรุณาแจ้ง admin พร้อมแนบ Chat ID ข้างต้น</i>`,
    ].join("\n");
  }

  await sendTelegramToChat(chatId, reply).catch(() => null);
  return NextResponse.json({ ok: true });
}
