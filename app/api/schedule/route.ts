import { NextRequest, NextResponse } from "next/server";
import {
  getScheduleConfig,
  updateScheduleConfig,
  listRecentRuns,
  BacktestScheduleConfig,
} from "@/lib/schedule/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorize(req: NextRequest, mutating: boolean): boolean {
  const expected = process.env.BACKTEST_CRON_SECRET;
  if (!expected) return true;
  // For reads we allow same-origin (no cron secret needed) so the dashboard
  // can render. For mutating ops we always require the cron secret.
  if (!mutating) return true;
  const got =
    req.headers.get("x-cron-secret") ??
    req.nextUrl.searchParams.get("secret") ??
    "";
  return got === expected;
}

export async function GET(req: NextRequest) {
  if (!authorize(req, false)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const [config, runs] = await Promise.all([
      getScheduleConfig(),
      listRecentRuns(20),
    ]);
    return NextResponse.json({ ok: true, config, runs });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  if (!authorize(req, true)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  let body: Partial<BacktestScheduleConfig> = {};
  try {
    body = (await req.json()) as Partial<BacktestScheduleConfig>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const allowed: Partial<BacktestScheduleConfig> = {};
  if (typeof body.enabled === "boolean") {
    allowed.enabled = body.enabled;
    // Auto-clear paused_reason when enabling, unless caller explicitly sends one.
    if (body.enabled && body.paused_reason === undefined) {
      allowed.paused_reason = null;
    }
  }
  if (typeof body.interval_minutes === "number" && body.interval_minutes >= 1)
    allowed.interval_minutes = Math.round(body.interval_minutes);
  if (body.paused_reason === null || typeof body.paused_reason === "string")
    allowed.paused_reason = body.paused_reason ?? null;

  try {
    const config = await updateScheduleConfig(allowed);
    return NextResponse.json({ ok: true, config });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}
