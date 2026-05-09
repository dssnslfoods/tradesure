"use server";

import { revalidatePath } from "next/cache";
import { updateScheduleConfig } from "@/lib/schedule/settings";

export async function setEnabled(enabled: boolean, reason?: string | null) {
  await updateScheduleConfig({
    enabled,
    paused_reason: enabled ? null : reason ?? "Paused from dashboard",
  });
  revalidatePath("/dashboard/schedule");
}

export async function setIntervalMinutes(minutes: number) {
  if (!Number.isFinite(minutes) || minutes < 1) {
    throw new Error("interval_minutes must be >= 1");
  }
  await updateScheduleConfig({ interval_minutes: Math.round(minutes) });
  revalidatePath("/dashboard/schedule");
}

export async function triggerRunNow() {
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
