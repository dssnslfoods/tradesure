"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { findUserById } from "@/lib/auth/otp";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth/session";

async function requireAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const c = await cookies();
  const session = await verifySessionToken(c.get(SESSION_COOKIE)?.value ?? null);
  if (!session) return { ok: false, error: "ยังไม่ได้ login" };
  const user = await findUserById(session.uid);
  if (!user || !user.is_active) return { ok: false, error: "user inactive" };
  if (!user.is_admin) return { ok: false, error: "ต้องเป็น admin เท่านั้น" };
  return { ok: true, userId: user.id };
}

async function countActiveAdminsExcluding(userId: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { count } = await supabase
    .from("auth_users")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true)
    .eq("is_admin", true)
    .neq("id", userId);
  return count ?? 0;
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

    // Guard: another auth_user might already have this chat_id (e.g. admin
    // who happens to be the same Telegram account). In that case, just link
    // the contact to the existing user instead of creating a duplicate.
    const { data: dupChat } = await supabase
      .from("auth_users")
      .select("id, username")
      .eq("telegram_chat_id", contact.chat_id)
      .maybeSingle();
    if (dupChat) {
      await supabase
        .from("telegram_contacts")
        .update({ registered_user_id: dupChat.id })
        .eq("id", contact.id);
      revalidatePath("/dashboard/users");
      return {
        ok: false,
        error: `Chat ID นี้ถูกใช้กับ user "${dupChat.username}" อยู่แล้ว — link contact ให้แล้ว`,
      };
    }

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

// Backfill telegram_contacts.registered_user_id by matching chat_id.
// Run automatically when the admin opens /dashboard/users so existing
// orphaned contacts get linked to existing auth_users.
export async function backfillContactLinks(): Promise<{ ok: boolean; linked?: number; error?: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  try {
    const supabase = getSupabaseAdmin();
    const { data: orphans, error } = await supabase
      .from("telegram_contacts")
      .select("id, chat_id")
      .is("registered_user_id", null);
    if (error) throw error;
    if (!orphans || orphans.length === 0) return { ok: true, linked: 0 };

    const chatIds = orphans.map((o) => o.chat_id);
    const { data: users } = await supabase
      .from("auth_users")
      .select("id, telegram_chat_id")
      .in("telegram_chat_id", chatIds);

    const map = new Map<string, string>();
    (users ?? []).forEach((u) => map.set(u.telegram_chat_id, u.id));

    let linked = 0;
    for (const c of orphans) {
      const uid = map.get(c.chat_id);
      if (uid) {
        await supabase
          .from("telegram_contacts")
          .update({ registered_user_id: uid })
          .eq("id", c.id);
        linked++;
      }
    }
    if (linked > 0) revalidatePath("/dashboard/users");
    return { ok: true, linked };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}

export async function setUserActive(userId: string, isActive: boolean) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  // Self-protection: cannot deactivate yourself
  if (userId === guard.userId && !isActive) {
    return { ok: false, error: "ไม่สามารถ deactivate ตัวเองได้" };
  }

  // If deactivating an admin, ensure at least one other active admin remains
  if (!isActive) {
    const supabase = getSupabaseAdmin();
    const { data: target } = await supabase
      .from("auth_users")
      .select("is_admin")
      .eq("id", userId)
      .maybeSingle();
    if (target?.is_admin) {
      const others = await countActiveAdminsExcluding(userId);
      if (others === 0) {
        return { ok: false, error: "ไม่สามารถ deactivate admin คนสุดท้ายได้" };
      }
    }
  }

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

  // Self-protection: cannot demote yourself unless another admin exists
  if (userId === guard.userId && !isAdmin) {
    const others = await countActiveAdminsExcluding(userId);
    if (others === 0) {
      return { ok: false, error: "ไม่สามารถ demote ตัวเองตอนเป็น admin คนสุดท้าย" };
    }
  }

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
