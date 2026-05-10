import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { findActiveUserByUsername, verifyOtp } from "@/lib/auth/otp";
import {
  createSessionToken,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
} from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { username?: string; code?: string };
  try {
    body = (await req.json()) as { username?: string; code?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const username = (body.username ?? "").trim();
  const code = (body.code ?? "").trim();

  if (!username || !code) {
    return NextResponse.json(
      { ok: false, error: "กรุณากรอก username และ รหัส" },
      { status: 400 }
    );
  }

  const user = await findActiveUserByUsername(username);
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "ข้อมูลไม่ถูกต้อง" },
      { status: 401 }
    );
  }

  const result = await verifyOtp(user.id, code);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 401 });
  }

  const { token, expiresAt } = await createSessionToken(user.id, user.username);

  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
    expires: expiresAt,
  });

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      is_admin: user.is_admin,
    },
    expires_at: expiresAt.toISOString(),
  });
}
