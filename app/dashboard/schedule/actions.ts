"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import {
  updateScheduleConfig,
  setApiKey as persistApiKey,
  addTradingPlan as catalogAdd,
  updateTradingPlan as catalogUpdate,
  removeTradingPlan as catalogRemove,
  type AiKeyProvider,
} from "@/lib/schedule/settings";
import { isCurrentUserAdmin } from "@/lib/auth/guards";
import type { TradingPlan, TradingPlanDef } from "@/types/signal";

async function requireAdminOrThrow() {
  if (!(await isCurrentUserAdmin())) {
    throw new Error("admin only");
  }
}

export async function setEnabled(enabled: boolean, reason?: string | null) {
  await requireAdminOrThrow();
  await updateScheduleConfig({
    enabled,
    paused_reason: enabled ? null : reason ?? "Paused from dashboard",
  });
  revalidatePath("/dashboard/schedule");
}

export async function setIntervalMinutes(minutes: number) {
  await requireAdminOrThrow();
  if (!Number.isFinite(minutes) || minutes < 1) {
    throw new Error("interval_minutes must be >= 1");
  }
  await updateScheduleConfig({ interval_minutes: Math.round(minutes) });
  revalidatePath("/dashboard/schedule");
}

export async function setCardRetentionDays(days: number) {
  await requireAdminOrThrow();
  if (!Number.isFinite(days) || days < 0 || days > 3650) {
    throw new Error("card_retention_days must be between 0 and 3650");
  }
  await updateScheduleConfig({ card_retention_days: Math.round(days) });
  // Both pages depend on the setting, so refresh both.
  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard");
}

export async function setAiActiveHours(start: number, end: number) {
  await requireAdminOrThrow();
  const ok = (n: number) => Number.isFinite(n) && n >= 0 && n <= 23 && Number.isInteger(n);
  if (!ok(start) || !ok(end)) {
    throw new Error("ai_active_hours must be integers between 0 and 23");
  }
  await updateScheduleConfig({
    ai_active_hours_start: start,
    ai_active_hours_end: end,
  });
  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard");
}

export async function setAiActiveWindows(
  windows: { start: number; end: number }[]
) {
  await requireAdminOrThrow();
  const ok = (n: number) => Number.isFinite(n) && n >= 0 && n <= 23 && Number.isInteger(n);
  for (const w of windows) {
    if (!ok(w.start) || !ok(w.end)) {
      throw new Error("each window's start/end must be integer 0-23");
    }
  }
  // Cap to a sane number of windows.
  if (windows.length > 8) {
    throw new Error("max 8 active windows");
  }
  await updateScheduleConfig({
    ai_active_windows: windows,
    // Mirror first window into legacy fields so old clients still see something useful
    ai_active_hours_start: windows[0]?.start ?? 0,
    ai_active_hours_end: windows[0]?.end ?? 0,
  });
  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard");
}

export async function setAiActiveDays(days: number[]) {
  await requireAdminOrThrow();
  const clean = Array.from(new Set(days))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    .sort((a, b) => a - b);
  await updateScheduleConfig({ ai_active_days: clean });
  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard");
}

export async function setTrendingAlertEnabled(enabled: boolean) {
  await requireAdminOrThrow();
  await updateScheduleConfig({ trending_alert_enabled: enabled });
  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard/trending");
  return { ok: true, enabled };
}

export async function setActiveTradingPlans(plans: TradingPlan[]) {
  await requireAdminOrThrow();
  // Catalog validation happens in the UI (admin only picks from existing
  // chips). Here we just dedupe + drop empty strings; allow empty array
  // as the intentional kill switch.
  const clean = Array.from(new Set(plans))
    .filter((p): p is TradingPlan => typeof p === "string" && p.length > 0);
  await updateScheduleConfig({ active_trading_plans: clean });
  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard");
  return { ok: true, plans: clean };
}

// ─── Trading plans catalog CRUD (admin master data) ──────────────────────

export async function addTradingPlan(def: TradingPlanDef) {
  await requireAdminOrThrow();
  const next = await catalogAdd(def);
  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard");
  return { ok: true, catalog: next };
}

export async function updateTradingPlan(
  key: string,
  patch: Partial<Omit<TradingPlanDef, "key">>
) {
  await requireAdminOrThrow();
  const next = await catalogUpdate(key, patch);
  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard");
  return { ok: true, catalog: next };
}

export async function removeTradingPlan(key: string) {
  await requireAdminOrThrow();
  const next = await catalogRemove(key);
  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard");
  return { ok: true, catalog: next };
}

export async function setAiApiKey(provider: AiKeyProvider, key: string | null) {
  await requireAdminOrThrow();
  if (provider !== "openai" && provider !== "gemini") {
    throw new Error("Invalid provider");
  }
  // Light validation — full validation happens on first real API call. We do
  // catch obvious paste mistakes (extra quotes, very short string) up front.
  if (typeof key === "string" && key.trim().length > 0) {
    const k = key.trim();
    if (k.length < 10) throw new Error("API key looks too short");
    if (provider === "openai" && !/^sk-/.test(k)) {
      throw new Error('OpenAI keys typically start with "sk-"');
    }
  }
  await persistApiKey(provider, key);
  revalidatePath("/dashboard/schedule");
  // Don't return anything — we never want plaintext keys flowing back to client.
  return { ok: true };
}

export async function setAiModel(modelId: string) {
  await requireAdminOrThrow();
  // Defer validation to the catalog so we don't import server-only code into
  // the action's caller bundle by accident.
  const { findModel } = await import("@/lib/ai/models");
  if (!findModel(modelId)) {
    throw new Error(`Unknown AI model: ${modelId}`);
  }
  await updateScheduleConfig({ ai_model: modelId });
  revalidatePath("/dashboard/schedule");
}

export async function setAiDualMode(
  mode: "single" | "compare" | "vote",
  secondaryModel: string
) {
  await requireAdminOrThrow();
  if (mode !== "single" && mode !== "compare" && mode !== "vote") {
    throw new Error("Invalid AI mode");
  }
  if (mode !== "single") {
    const { findModel } = await import("@/lib/ai/models");
    if (!findModel(secondaryModel)) {
      throw new Error(`Unknown secondary AI model: ${secondaryModel}`);
    }
  }
  await updateScheduleConfig({
    ai_mode: mode,
    ai_model_secondary: secondaryModel,
  });
  revalidatePath("/dashboard/schedule");
}

export async function processQueuedSignals() {
  await requireAdminOrThrow();
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.URL ??
    "http://localhost:3000";

  // The endpoint itself enforces admin auth via cookie — forward the request
  // through the same Next.js process so we keep the cookie.
  const cookieHeader = cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const res = await fetch(`${base}/api/admin/process-queued?limit=50`, {
    method: "POST",
    cache: "no-store",
    headers: { cookie: cookieHeader },
  });
  const data: unknown = await res.json().catch(() => ({}));
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/schedule");
  return data;
}

export async function triggerRunNow() {
  await requireAdminOrThrow();
  // Internal call: hit our own backtest endpoint with force=1 (overrides paused
  // flag) and trigger=manual so it gets logged correctly.
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.URL ??
    "http://localhost:3000";
  const secret = process.env.BACKTEST_CRON_SECRET ?? "";

  const res = await fetch(
    `${base}/api/backtest/run?reeval=1&limit=200&force=1&trigger=manual`,
    {
      method: "POST",
      headers: secret ? { "x-cron-secret": secret } : {},
      cache: "no-store",
    }
  );
  const data: unknown = await res.json().catch(() => ({}));
  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard");
  return data;
}
