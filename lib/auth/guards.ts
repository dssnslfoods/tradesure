// Server-side helpers for role checks in pages and server actions.

import { cookies } from "next/headers";
import { findUserById, type AuthUser } from "@/lib/auth/otp";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth/session";

export async function getCurrentUser(): Promise<AuthUser | null> {
  const c = await cookies();
  const session = await verifySessionToken(c.get(SESSION_COOKIE)?.value ?? null);
  if (!session) return null;
  const user = await findUserById(session.uid);
  if (!user || !user.is_active) return null;
  return user;
}

export async function isCurrentUserAdmin(): Promise<boolean> {
  const u = await getCurrentUser();
  return Boolean(u?.is_admin);
}
