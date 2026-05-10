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
