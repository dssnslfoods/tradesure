import { randomInt } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const OTP_LENGTH = 4;
export const OTP_TTL_MINUTES = 5;
export const RATE_LIMIT_WINDOW_MIN = 10;
export const RATE_LIMIT_MAX = 3;
export const MAX_VERIFY_ATTEMPTS = 5;

export interface AuthUser {
  id: string;
  username: string;
  display_name: string | null;
  telegram_chat_id: string;
  is_active: boolean;
  is_admin: boolean;
}

export function generateOtp(): string {
  // randomInt is cryptographically secure, unlike Math.random.
  // Range [0, 10000) → pad to 4 digits with leading zeros.
  const n = randomInt(0, 10 ** OTP_LENGTH);
  return n.toString().padStart(OTP_LENGTH, "0");
}

export async function findActiveUserByUsername(
  username: string
): Promise<AuthUser | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("auth_users")
    .select("id, username, display_name, telegram_chat_id, is_active, is_admin")
    .ilike("username", username.trim())
    .eq("is_active", true)
    .maybeSingle();
  if (error || !data) return null;
  return data as AuthUser;
}

export async function findUserById(id: string): Promise<AuthUser | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("auth_users")
    .select("id, username, display_name, telegram_chat_id, is_active, is_admin")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return data as AuthUser;
}

export async function countRecentCodes(userId: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MIN * 60_000).toISOString();
  const { count, error } = await supabase
    .from("auth_otp_codes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);
  if (error) return 0;
  return count ?? 0;
}

export async function createOtp(
  userId: string,
  ip: string | null,
  userAgent: string | null
): Promise<{ ok: true; code: string; expiresAt: Date } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin();
  const code = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);

  // Invalidate any unexpired/unused codes for this user so only the latest works.
  await supabase
    .from("auth_otp_codes")
    .update({ used_at: new Date().toISOString() })
    .is("used_at", null)
    .eq("user_id", userId)
    .gt("expires_at", new Date().toISOString());

  const { error } = await supabase.from("auth_otp_codes").insert({
    user_id: userId,
    code,
    expires_at: expiresAt.toISOString(),
    ip_address: ip,
    user_agent: userAgent,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, code, expiresAt };
}

export async function verifyOtp(
  userId: string,
  code: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  const { data: otp, error } = await supabase
    .from("auth_otp_codes")
    .select("id, code, expires_at, used_at, attempt_count")
    .eq("user_id", userId)
    .is("used_at", null)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !otp) return { ok: false, error: "ไม่พบรหัสที่ยังใช้งานได้ — กรุณาขอรหัสใหม่" };

  if (otp.attempt_count >= MAX_VERIFY_ATTEMPTS) {
    // Burn it
    await supabase
      .from("auth_otp_codes")
      .update({ used_at: nowIso })
      .eq("id", otp.id);
    return { ok: false, error: "กรอกผิดเกินกำหนด — กรุณาขอรหัสใหม่" };
  }

  if (otp.code !== code.trim()) {
    await supabase
      .from("auth_otp_codes")
      .update({ attempt_count: otp.attempt_count + 1 })
      .eq("id", otp.id);
    return { ok: false, error: `รหัสไม่ถูกต้อง (เหลือ ${MAX_VERIFY_ATTEMPTS - otp.attempt_count - 1} ครั้ง)` };
  }

  // Mark as used
  await supabase
    .from("auth_otp_codes")
    .update({ used_at: nowIso })
    .eq("id", otp.id);
  await supabase
    .from("auth_users")
    .update({ last_login_at: nowIso })
    .eq("id", userId);

  return { ok: true };
}
