import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  broadcastTelegramMessage,
  buildConfigBroadcastMessage,
  type ConfigBroadcastInput,
} from "@/lib/telegram/sendTelegramMessage";
import { isCurrentUserAdmin } from "@/lib/auth/guards";
import {
  getMaskedApiKeys,
  getScheduleConfig,
  isWithinAiSchedule,
} from "@/lib/schedule/settings";
import { findModel } from "@/lib/ai/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin diagnostic: shows who would receive a broadcast and (optionally)
// fires a test message. Hits the same code path as real signal alerts.
//
// GET  → preview recipients only (no message sent)
// POST → send a "🧪 Broadcast test" message to all recipients

async function listRecipients(): Promise<{
  envChatId: string | null;
  activeUsers: { username: string; chat_id: string }[];
  uniqueChatIds: string[];
}> {
  const envChatId = process.env.TELEGRAM_CHAT_ID ?? null;
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("auth_users")
    .select("username, telegram_chat_id")
    .eq("is_active", true);
  const activeUsers = (data ?? []).map((u: { username: string; telegram_chat_id: string }) => ({
    username: u.username,
    chat_id: u.telegram_chat_id,
  }));

  const set = new Set<string>();
  if (envChatId) set.add(envChatId);
  activeUsers.forEach((u) => {
    if (u.chat_id) set.add(u.chat_id);
  });

  return {
    envChatId,
    activeUsers,
    uniqueChatIds: [...set],
  };
}

export async function GET() {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ ok: false, error: "admin only" }, { status: 403 });
  }
  const r = await listRecipients();
  return NextResponse.json({
    ok: true,
    env_chat_id: r.envChatId,
    env_chat_id_set: !!r.envChatId,
    active_users: r.activeUsers,
    unique_chat_ids: r.uniqueChatIds,
    total_recipients: r.uniqueChatIds.length,
  });
}

/**
 * Test broadcast doubles as a system-status announcement: every recipient
 * gets a snapshot of the current AI model / schedule / filters so they
 * understand what the bot is doing right now. Useful after config changes
 * ("FYI we just enabled Gemini 2.5 Pro" / "AI is now Mon-Fri only").
 *
 * Falls back gracefully if any settings query fails so the test broadcast
 * itself still goes out even if Supabase is having a moment.
 */
async function buildSnapshot(): Promise<ConfigBroadcastInput> {
  // Helpers to summarise the schedule the same way the dashboard does.
  const describeWindows = (windows: { start: number; end: number }[]): string => {
    if (windows.length === 0) return "24h (always on)";
    return windows
      .map((w) => {
        const s = `${String(w.start).padStart(2, "0")}:00`;
        const e = `${String(w.end).padStart(2, "0")}:00`;
        if (w.start === w.end) return "24h";
        if (w.start > w.end) return `${s}–${e} (overnight)`;
        return `${s}–${e}`;
      })
      .join(" + ");
  };
  const describeDays = (days: number[]): string => {
    if (days.length === 7) return "Every day";
    const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return days.map((d) => names[d]).join(", ");
  };

  const supabase = getSupabaseAdmin();
  const [cfg, apiKeys, queuedRes, totalRes, contactsRes] = await Promise.all([
    getScheduleConfig().catch(() => null),
    getMaskedApiKeys().catch(() => null),
    supabase
      .from("ai_signal_analysis")
      .select("id", { count: "exact", head: true })
      .eq("outcome", "QUEUED"),
    supabase.from("ai_signal_analysis").select("id", { count: "exact", head: true }),
    supabase
      .from("auth_users")
      .select("id", { count: "exact", head: true })
      .not("telegram_chat_id", "is", null),
  ]);

  const primaryInfo = cfg?.ai_model ? findModel(cfg.ai_model) : undefined;
  const secondaryInfo = cfg?.ai_model_secondary ? findModel(cfg.ai_model_secondary) : undefined;

  const providerLabel = (p?: string) =>
    p === "gemini" ? "Google Gemini" : p === "openai" ? "OpenAI" : "—";

  return {
    schedulerEnabled: cfg?.enabled ?? true,
    pauseReason: cfg?.paused_reason ?? null,
    intervalMinutes: cfg?.interval_minutes ?? 15,
    cardRetentionDays: cfg?.card_retention_days ?? 7,

    aiModel: cfg?.ai_model ?? "gpt-4o-mini",
    aiMode: cfg?.ai_mode ?? "single",
    aiModelSecondary: cfg?.ai_model_secondary ?? "",
    primaryProviderLabel: providerLabel(primaryInfo?.provider),
    secondaryProviderLabel: providerLabel(secondaryInfo?.provider),

    openaiKeyConfigured: apiKeys?.openai.configured ?? false,
    openaiKeySource: apiKeys?.openai.source ?? "none",
    geminiKeyConfigured: apiKeys?.gemini.configured ?? false,
    geminiKeySource: apiKeys?.gemini.source ?? "none",

    aiActiveNow: cfg
      ? isWithinAiSchedule(cfg.ai_active_windows, cfg.ai_active_days)
      : true,
    aiActiveWindowsSummary: describeWindows(cfg?.ai_active_windows ?? []),
    aiActiveDaysSummary: describeDays(cfg?.ai_active_days ?? [0, 1, 2, 3, 4, 5, 6]),

    activeTradingPlansSummary: (() => {
      const plans = cfg?.active_trading_plans ?? ["swing", "intraday"];
      if (plans.length === 0) return "❌ ALL DISABLED (kill switch)";
      return plans
        .map((p) => (p === "swing" ? "🔵 Swing (1H)" : "🟣 Intraday (15m)"))
        .join(" + ");
    })(),

    minConfidence: process.env.MIN_CONFIDENCE ?? "70",
    blockedHours: process.env.BLOCKED_HOURS ?? "13,14,16,17,20",
    notradeTelegram: process.env.NOTRADE_TELEGRAM ?? "1",

    telegramContactCount: contactsRes.count ?? 0,
    totalSignals: totalRes.count ?? 0,
    queuedCount: queuedRes.count ?? 0,
  };
}

export async function POST(req: NextRequest) {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ ok: false, error: "admin only" }, { status: 403 });
  }

  const recipients = await listRecipients();
  const snapshot = await buildSnapshot();
  const message = buildConfigBroadcastMessage(snapshot);

  const result = await broadcastTelegramMessage(message);
  void req;

  return NextResponse.json({
    ok: result.ok,
    sent: result.sent,
    failed: result.failed,
    errors: result.errors,
    recipients: recipients.uniqueChatIds,
    snapshot,
  });
}
