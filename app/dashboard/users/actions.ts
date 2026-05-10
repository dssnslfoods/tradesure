"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { findUserById } from "@/lib/auth/otp";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth/session";

async function requireAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const c = await cookies();
  const session = await verifySessionToken(c.get(SESSION_COOKIE)?.value ?? null);
  if (!session) return { ok: false, error: "ยังไม่ได้ login" };
  const user = await findUserById(session.uid);
  if (!user || !user.is_active) return { ok: false, error: "user inactive" };
  if (!user.is_admin) return { ok: false, error: "ต้องเป็น admin เท่านั้น" };
  return { ok: true };
}

export async function createUserFromContact(input: {
  contactId: string;
  username: string;
  displayName: string;
  isAdmin: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const username = input.username.trim();
  if (!username) return { ok: false, error: "username ห้ามว่าง" };
  if (!/^[a-zA-Z0-9_-]{2,40}$/.test(username)) {
    return { ok: false, error: "username ใช้ได้แค่ a-z, A-Z, 0-9, _, - ความยาว 2-40" };
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: contact, error: cErr } = await supabase
      .from("telegram_contacts")
      .select("id, chat_id, registered_user_id")
      .eq("id", input.contactId)
      .single();
    if (cErr || !contact) throw new Error("contact not found");
    if (contact.registered_user_id) throw new Error("contact นี้ถูกผูกกับ user แล้ว");

    const { data: newUser, error: uErr } = await supabase
      .from("auth_users")
      .insert({
        username,
        display_name: input.displayName.trim() || null,
        telegram_chat_id: contact.chat_id,
        is_admin: input.isAdmin,
        is_active: true,
      })
      .select("id")
      .single();
    if (uErr || !newUser) throw new Error(uErr?.message ?? "insert user failed");

    await supabase
      .from("telegram_contacts")
      .update({ registered_user_id: newUser.id })
      .eq("id", contact.id);

    revalidatePath("/dashboard/users");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}

export async function setUserActive(userId: string, isActive: boolean) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("auth_users")
    .update({ is_active: isActive })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/users");
  return { ok: true };
}

export async function setUserAdmin(userId: string, isAdmin: boolean) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("auth_users")
    .update({ is_admin: isAdmin })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/users");
  return { ok: true };
}

// =====================================================
// Telegram bot webhook management
// =====================================================

export interface TelegramWebhookInfo {
  ok: boolean;
  url?: string;
  has_custom_certificate?: boolean;
  pending_update_count?: number;
  last_error_date?: number;
  last_error_message?: string;
  last_synchronization_error_date?: number;
  max_connections?: number;
  ip_address?: string;
  allowed_updates?: string[];
  error?: string;
}

function getBotToken(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN not configured");
  return t;
}

function getWebhookSecret(): string | null {
  return process.env.TELEGRAM_WEBHOOK_SECRET ?? null;
}

function getSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.URL ??
    "https://tradesure.d2infinite.com"
  );
}

export async function getTelegramWebhookInfo(): Promise<TelegramWebhookInfo> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  try {
    const token = getBotToken();
    const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, {
      cache: "no-store",
    });
    const data = (await res.json()) as { ok: boolean; result?: Record<string, unknown>; description?: string };
    if (!data.ok || !data.result) {
      return { ok: false, error: data.description ?? "Telegram returned not ok" };
    }
    return { ok: true, ...(data.result as Omit<TelegramWebhookInfo, "ok">) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}

export async function setTelegramWebhook(): Promise<{ ok: boolean; url?: string; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  try {
    const token = getBotToken();
    const secret = getWebhookSecret();
    const url = `${getSiteUrl()}/api/telegram/bot`;

    const body: Record<string, unknown> = {
      url,
      allowed_updates: ["message"],
      drop_pending_updates: false,
    };
    if (secret) body.secret_token = secret;

    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = (await res.json()) as { ok: boolean; description?: string };
    if (!data.ok) return { ok: false, error: data.description ?? "Telegram returned not ok" };
    revalidatePath("/dashboard/users");
    return { ok: true, url };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}

export async function deleteTelegramWebhook(): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  try {
    const token = getBotToken();
    const res = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drop_pending_updates: false }),
      cache: "no-store",
    });
    const data = (await res.json()) as { ok: boolean; description?: string };
    if (!data.ok) return { ok: false, error: data.description ?? "Telegram returned not ok" };
    revalidatePath("/dashboard/users");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}

export async function deleteContact(contactId: string) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("telegram_contacts")
    .delete()
    .eq("id", contactId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/users");
  return { ok: true };
}
