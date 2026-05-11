import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { findUserById } from "@/lib/auth/otp";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth/session";
import UsersClient from "./UsersClient";
import { backfillContactLinks } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export interface UserRow {
  id: string;
  username: string;
  display_name: string | null;
  telegram_chat_id: string;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
  last_login_at: string | null;
}

export interface ContactRow {
  id: string;
  chat_id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  language_code: string | null;
  is_bot: boolean;
  last_message_text: string | null;
  message_count: number;
  registered_user_id: string | null;
  first_seen_at: string;
  last_seen_at: string;
}

export default async function UsersPage() {
  const c = await cookies();
  const session = await verifySessionToken(c.get(SESSION_COOKIE)?.value ?? null);
  if (!session) redirect("/login?next=/dashboard/users");
  const me = await findUserById(session.uid);
  if (!me?.is_active) redirect("/login");
  if (!me.is_admin) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="text-[22px] font-bold text-sig-sell">Access denied</h1>
        <p className="mt-2 text-[13px] text-ink-muted">
          หน้านี้สำหรับ admin เท่านั้น
        </p>
        <Link href="/dashboard" className="btn btn-secondary mt-6 inline-flex">
          กลับไป Dashboard
        </Link>
      </div>
    );
  }

  // Best-effort: link any orphaned contacts to existing users with matching chat_id
  await backfillContactLinks().catch(() => null);

  const supabase = getSupabaseAdmin();
  const [usersQ, contactsQ] = await Promise.all([
    supabase
      .from("auth_users")
      .select(
        "id, username, display_name, telegram_chat_id, is_active, is_admin, created_at, last_login_at"
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("telegram_contacts")
      .select(
        "id, chat_id, username, first_name, last_name, language_code, is_bot, last_message_text, message_count, registered_user_id, first_seen_at, last_seen_at"
      )
      .order("last_seen_at", { ascending: false }),
  ]);

  const users = (usersQ.data ?? []) as UserRow[];
  const contacts = (contactsQ.data ?? []) as ContactRow[];

  return (
    <>
      <header className="mb-7">
        <div className="eyebrow">Admin · Identity & access</div>
        <h1 className="mt-1 text-[24px] font-bold tracking-tightest text-ink-primary sm:text-[32px]">
          Users &amp; Telegram contacts
        </h1>
        <p className="mt-1 text-[13px] text-ink-secondary">
          จัดการบัญชีผู้ใช้และแปลง Telegram contacts ให้เป็น user
        </p>
      </header>

      <UsersClient users={users} contacts={contacts} currentUserId={me.id} />
    </>
  );
}
