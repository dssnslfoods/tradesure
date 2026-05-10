import { NextRequest, NextResponse } from "next/server";
import {
  countRecentCodes,
  createOtp,
  findActiveUserByUsername,
  OTP_TTL_MINUTES,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MIN,
} from "@/lib/auth/otp";
import { sendTelegramToChat } from "@/lib/telegram/sendTelegramMessage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { username?: string };
  try {
    body = (await req.json()) as { username?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const username = (body.username ?? "").trim();
  if (!username) {
    return NextResponse.json({ ok: false, error: "กรุณากรอก username" }, { status: 400 });
  }

  const user = await findActiveUserByUsername(username);
  if (!user) {
    // Don't disclose whether the username exists
    return NextResponse.json({
      ok: true,
      message: "ถ้า username นี้มีอยู่ในระบบ รหัสจะถูกส่งไปที่ Telegram",
      sent: false,
    });
  }

  const recent = await countRecentCodes(user.id);
  if (recent >= RATE_LIMIT_MAX) {
    return NextResponse.json(
      {
        ok: false,
        error: `ขอรหัสเกิน ${RATE_LIMIT_MAX} ครั้งในช่วง ${RATE_LIMIT_WINDOW_MIN} นาที — กรุณารอสักครู่`,
      },
      { status: 429 }
    );
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;
  const ua = req.headers.get("user-agent") ?? null;

  const created = await createOtp(user.id, ip, ua);
  if (!created.ok) {
    return NextResponse.json({ ok: false, error: created.error }, { status: 500 });
  }

  const message = [
    "🔐 <b>รหัสเข้าสู่ระบบ Tradesure</b>",
    "",
    `<code>${created.code}</code>`,
    "",
    `รหัสนี้หมดอายุใน ${OTP_TTL_MINUTES} นาที`,
    `ผู้ใช้: <b>${user.username}</b>`,
    ip ? `IP: <code>${ip}</code>` : "",
    "",
    "⚠️ ถ้าคุณไม่ได้ขอรหัสนี้ กรุณาแจ้งผู้ดูแลระบบทันที",
  ]
    .filter(Boolean)
    .join("\n");

  const tg = await sendTelegramToChat(user.telegram_chat_id, message);
  if (!tg.ok) {
    return NextResponse.json(
      { ok: false, error: `ส่ง Telegram ล้มเหลว: ${tg.error ?? "unknown"}` },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    sent: true,
    user_id: user.id,
    expires_in_minutes: OTP_TTL_MINUTES,
  });
}
