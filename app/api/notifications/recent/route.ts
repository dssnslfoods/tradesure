import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type NotificationType =
  | "WIN_TP1"
  | "WIN_TP2"
  | "LOSS_SL"
  | "NEW_CONTACT"
  | "OPEN"
  | "PENDING";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  subtitle: string;
  link?: string;
  at: string; // ISO timestamp
  meta?: Record<string, string | number | null>;
}

interface OutcomeRow {
  id: string;
  symbol: string;
  outcome: string | null;
  outcome_at: string | null;
  pnl_pct: number | null;
  bias: string | null;
}

interface ContactRow {
  id: string;
  chat_id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  first_seen_at: string;
  registered_user_id: string | null;
}

function fmtPct(p: number | null): string {
  if (p === null || p === undefined) return "—";
  const sign = p >= 0 ? "+" : "";
  return `${sign}${p.toFixed(2)}%`;
}

export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const sinceParam = url.searchParams.get("since");
  // Default lookback: last 7 days; override with ?since=ISO
  const sinceIso = sinceParam ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const supabase = getSupabaseAdmin();
    const items: NotificationItem[] = [];

    // 1) Trade outcomes (TP/SL hits)
    const { data: outcomes } = await supabase
      .from("ai_signal_analysis")
      .select("id, symbol, outcome, outcome_at, pnl_pct, bias")
      .in("outcome", ["WIN_TP1", "WIN_TP2", "LOSS_SL"])
      .gte("outcome_at", sinceIso)
      .order("outcome_at", { ascending: false })
      .limit(50);
    (outcomes ?? []).forEach((r: OutcomeRow) => {
      if (!r.outcome_at) return;
      const map: Record<string, { title: string }> = {
        WIN_TP1: { title: "TP1 hit" },
        WIN_TP2: { title: "TP2 hit" },
        LOSS_SL: { title: "Stop loss hit" },
      };
      const m = map[r.outcome ?? ""];
      if (!m) return;
      items.push({
        id: `outcome:${r.id}`,
        type: r.outcome as NotificationType,
        title: `${r.symbol} · ${m.title}`,
        subtitle: `${r.bias ?? ""} · PnL ${fmtPct(r.pnl_pct)}`,
        link: "/dashboard",
        at: r.outcome_at,
        meta: { symbol: r.symbol, pnl: r.pnl_pct },
      });
    });

    // 2) New Telegram contacts (admin only — they care about onboarding)
    if (me.is_admin) {
      const { data: contacts } = await supabase
        .from("telegram_contacts")
        .select("id, chat_id, username, first_name, last_name, first_seen_at, registered_user_id")
        .gte("first_seen_at", sinceIso)
        .order("first_seen_at", { ascending: false })
        .limit(20);
      (contacts ?? []).forEach((c: ContactRow) => {
        const name =
          [c.first_name, c.last_name].filter(Boolean).join(" ") ||
          (c.username ? `@${c.username}` : `chat:${c.chat_id}`);
        items.push({
          id: `contact:${c.id}`,
          type: "NEW_CONTACT",
          title: `${name} ทักมาทาง Telegram`,
          subtitle: c.registered_user_id
            ? "Linked to existing user"
            : "Pending — รอ admin อนุมัติ",
          link: "/dashboard/users",
          at: c.first_seen_at,
          meta: { chat_id: c.chat_id, registered: c.registered_user_id ? 1 : 0 },
        });
      });
    }

    // Sort by timestamp desc + cap to 30 most recent
    items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    const trimmed = items.slice(0, 30);

    return NextResponse.json({
      ok: true,
      count: trimmed.length,
      items: trimmed,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}
