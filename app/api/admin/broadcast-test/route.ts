import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { broadcastTelegramMessage } from "@/lib/telegram/sendTelegramMessage";
import { isCurrentUserAdmin } from "@/lib/auth/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin diagnostic: shows who would receive a broadcast and (optionally)
// fires a test message. Hits the same code path as real signal alerts.
//
// GET  → preview recipients only (no message sent)
// POST → send a "🧪 Broadcast test" message to all recipients

async function listRecipients(): Promise<{
  envChatId: string | null;
  activeUsers: { username: string; chat_id: string }[];
  uniqueChatIds: string[];
}> {
  const envChatId = process.env.TELEGRAM_CHAT_ID ?? null;
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("auth_users")
    .select("username, telegram_chat_id")
    .eq("is_active", true);
  const activeUsers = (data ?? []).map((u: { username: string; telegram_chat_id: string }) => ({
    username: u.username,
    chat_id: u.telegram_chat_id,
  }));

  const set = new Set<string>();
  if (envChatId) set.add(envChatId);
  activeUsers.forEach((u) => {
    if (u.chat_id) set.add(u.chat_id);
  });

  return {
    envChatId,
    activeUsers,
    uniqueChatIds: [...set],
  };
}

export async function GET() {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ ok: false, error: "admin only" }, { status: 403 });
  }
  const r = await listRecipients();
  return NextResponse.json({
    ok: true,
    env_chat_id: r.envChatId,
    env_chat_id_set: !!r.envChatId,
    active_users: r.activeUsers,
    unique_chat_ids: r.uniqueChatIds,
    total_recipients: r.uniqueChatIds.length,
  });
}

export async function POST(req: NextRequest) {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ ok: false, error: "admin only" }, { status: 403 });
  }

  const recipients = await listRecipients();
  const ts = new Date().toLocaleString("en-GB", { hour12: false });

  const message = [
    "🧪 <b>Broadcast Test</b>",
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    `Triggered by admin at ${ts}`,
    "",
    `📡 จะส่งไปทั้งหมด <b>${recipients.uniqueChatIds.length}</b> chat(s):`,
    "",
    `• env <code>TELEGRAM_CHAT_ID</code>: ${recipients.envChatId ?? "(not set)"}`,
    "",
    `• Active users (${recipients.activeUsers.length}):`,
    ...recipients.activeUsers.map(
      (u) => `  - <b>${u.username}</b>: <code>${u.chat_id}</code>`
    ),
    "",
    "ถ้าคุณได้รับข้อความนี้ = broadcast multi-user ทำงานถูกต้อง ✅",
    "",
    "<i>(ไม่ใช่ trading signal — แค่ทดสอบระบบ)</i>",
  ].join("\n");

  const result = await broadcastTelegramMessage(message);
  void req;

  return NextResponse.json({
    ok: result.ok,
    sent: result.sent,
    failed: result.failed,
    errors: result.errors,
    recipients: recipients.uniqueChatIds,
  });
}
