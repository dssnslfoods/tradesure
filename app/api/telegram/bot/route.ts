import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { sendTelegramToChat } from "@/lib/telegram/sendTelegramMessage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Telegram Bot API webhook receiver.
// Configure once via setWebhook with a secret_token; Telegram includes that
// secret in the X-Telegram-Bot-Api-Secret-Token header on every callback.

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
  chat: {
    id: number;
    type: string;
    first_name?: string;
    last_name?: string;
    username?: string;
  };
  date: number;
  text?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
}

export async function GET() {
  return NextResponse.json({ ok: true, message: "Telegram bot webhook" });
}

export async function POST(req: NextRequest) {
  // Validate secret token if configured
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

  const msg = update.message ?? update.edited_message;
  if (!msg) {
    // Other update types (callback_query, etc.) — ignore
    return NextResponse.json({ ok: true, ignored: true });
  }

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

  // Upsert by chat_id; bump counters on repeat messages.
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
        // Backfill the link if it was missing
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

  // Reply with a friendly welcome / status message
  const displayName = from.first_name ?? from.username ?? "ผู้ใช้";
  let reply: string;
  if (alreadyRegistered) {
    reply = [
      `สวัสดี ${displayName} 👋`,
      "",
      `Chat ID ของคุณ: <code>${chatId}</code>`,
      "",
      "✅ บัญชีของคุณได้รับสิทธิ์เข้าใช้ระบบแล้ว",
      "เปิด <a href=\"https://tradesure.d2infinite.com/login\">tradesure.d2infinite.com</a> เพื่อเข้าสู่ระบบ",
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

  // Don't fail the webhook if Telegram reply fails
  await sendTelegramToChat(chatId, reply).catch(() => null);

  return NextResponse.json({ ok: true });
}
