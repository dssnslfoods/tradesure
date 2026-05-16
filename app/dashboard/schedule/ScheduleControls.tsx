"use client";

import { useState, useTransition } from "react";
import {
  setEnabled,
  setIntervalMinutes,
  setCardRetentionDays,
  setActiveTradingPlans,
  setTrendingAlertEnabled,
  setAiActiveWindows,
  setAiActiveDays,
  setAiModel,
  setAiDualMode,
  setAiApiKey,
  processQueuedSignals,
  triggerRunNow,
  addTradingPlan,
  removeTradingPlan,
  setPlanTelegramEnabled,
} from "./actions";
import type { TradingPlan, TradingPlanDef } from "@/types/signal";
import { DEFAULT_TRADING_PLAN_KEYS } from "@/types/signal";

// Map catalog color name → tailwind chip classes (active state).
// The inactive variant always uses the muted surface-2 chip.
const PLAN_COLOR_CLASSES: Record<TradingPlanDef["color"], string> = {
  info:   "border-sig-info/40 bg-sig-info/15 text-sig-info",
  violet: "border-sig-violet/40 bg-sig-violet/15 text-sig-violet",
  warn:   "border-sig-warn/40 bg-sig-warn/15 text-sig-warn",
  buy:    "border-sig-buy/40 bg-sig-buy/15 text-sig-buy",
  sell:   "border-sig-sell/40 bg-sig-sell/15 text-sig-sell",
  brand:  "border-brand/40 bg-brand/15 text-brand",
};
import {
  isWithinAiSchedule,
  type AiWindow,
  type BacktestScheduleConfig,
  type MaskedApiKeys,
} from "@/lib/schedule/settings";
import { AI_MODELS, findModel, DEFAULT_AI_MODEL } from "@/lib/ai/models";
import Icon from "@/components/ui/Icon";

const DAY_LABELS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function describeWindows(windows: AiWindow[]): string {
  if (windows.length === 0) return "ทำงาน 24 ชั่วโมง (ไม่จำกัดเวลา)";
  return windows
    .map((w) => {
      const s = `${String(w.start).padStart(2, "0")}:00`;
      const e = `${String(w.end).padStart(2, "0")}:00`;
      if (w.start === w.end) return "24ชม.";
      if (w.start > w.end) return `${s}–${e} (ข้ามคืน)`;
      return `${s}–${e}`;
    })
    .join(" + ");
}

export default function ScheduleControls({
  config,
  queuedCount,
  apiKeys,
  plansCatalog,
}: {
  config: BacktestScheduleConfig;
  queuedCount: number;
  apiKeys: MaskedApiKeys;
  plansCatalog: TradingPlanDef[];
}) {
  const [pending, start] = useTransition();
  const [interval, setIntervalState] = useState(config.interval_minutes);
  const [retention, setRetention] = useState(config.card_retention_days);
  const [model, setModel] = useState(config.ai_model || DEFAULT_AI_MODEL);
  const [aiMode, setAiMode] = useState<"single" | "compare" | "vote">(
    config.ai_mode ?? "single"
  );
  const [secondaryModel, setSecondaryModel] = useState(
    config.ai_model_secondary || "gemini-2.5-flash"
  );
  const dualChanged =
    aiMode !== (config.ai_mode ?? "single") ||
    secondaryModel !== (config.ai_model_secondary || "gemini-2.5-flash");
  const [openaiKey, setOpenaiKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [windows, setWindows] = useState<AiWindow[]>(
    config.ai_active_windows.length > 0
      ? config.ai_active_windows
      : config.ai_active_hours_start === 0 && config.ai_active_hours_end === 0
      ? []
      : [{ start: config.ai_active_hours_start, end: config.ai_active_hours_end }]
  );
  const [days, setDays] = useState<number[]>(config.ai_active_days);
  const [plans, setPlans] = useState<TradingPlan[]>(config.active_trading_plans);
  const plansChanged =
    JSON.stringify([...plans].sort()) !==
    JSON.stringify([...config.active_trading_plans].sort());
  const togglePlan = (p: TradingPlan) => {
    setPlans((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  };
  const [reason, setReason] = useState(config.paused_reason ?? "");
  const [msg, setMsg] = useState<string | null>(null);

  const currentlyActive = isWithinAiSchedule(
    config.ai_active_windows,
    config.ai_active_days
  );
  const windowsChanged =
    JSON.stringify(windows) !== JSON.stringify(config.ai_active_windows);
  const daysChanged =
    JSON.stringify([...days].sort()) !==
    JSON.stringify([...config.ai_active_days].sort());

  const toggleDay = (d: number) => {
    setDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)
    );
  };
  const addWindow = () => setWindows((w) => [...w, { start: 0, end: 0 }]);
  const removeWindow = (i: number) => setWindows((w) => w.filter((_, idx) => idx !== i));
  const updateWindow = (i: number, patch: Partial<AiWindow>) =>
    setWindows((w) => w.map((win, idx) => (idx === i ? { ...win, ...patch } : win)));

  const safeRun = (fn: () => Promise<unknown>) =>
    start(async () => {
      try {
        setMsg(null);
        await fn();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Action failed");
      }
    });

  return (
    <div className="space-y-4">
      {/* Enable / Pause */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <div className="flex items-center gap-2">
            <span className={`pulse-dot ${config.enabled ? "" : "!bg-sig-sell"}`} />
            <span className="text-[14px] font-semibold text-ink-primary">
              {config.enabled ? "Active" : "Paused"}
            </span>
          </div>
          {!config.enabled && config.paused_reason && (
            <p className="mt-1 text-[11px] text-ink-muted">
              Reason: <span className="text-ink-secondary">{config.paused_reason}</span>
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {config.enabled ? (
            <>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Pause reason (optional)"
                className="h-9 rounded-chip border border-white/5 bg-surface-2/60 px-3 text-[13px] text-ink-primary placeholder:text-ink-faint"
              />
              <button
                disabled={pending}
                onClick={() => safeRun(() => setEnabled(false, reason || null))}
                className="btn !bg-sig-sell/15 !text-sig-sell !border-sig-sell/30 hover:!bg-sig-sell/25 disabled:opacity-60"
              >
                <Icon name="pause" size={12} />
                Pause
              </button>
            </>
          ) : (
            <button
              disabled={pending}
              onClick={() => safeRun(() => setEnabled(true))}
              className="btn btn-primary disabled:opacity-60"
            >
              <Icon name="play" size={12} />
              Resume
            </button>
          )}
        </div>
      </div>

      {/* Interval */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <div className="text-[14px] font-semibold text-ink-primary">Display interval</div>
          <p className="mt-1 text-[11px] text-ink-muted">
            ตัวเลขนี้เป็นเพียงข้อมูลแสดง — ความถี่จริงตั้งจาก Cloud Scheduler
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={1440}
            value={interval}
            onChange={(e) => setIntervalState(Number(e.target.value))}
            className="h-9 w-20 rounded-chip border border-white/5 bg-surface-2/60 px-3 font-mono text-[13px] tabular text-ink-primary"
          />
          <span className="text-[12px] text-ink-muted">min</span>
          <button
            disabled={pending || interval === config.interval_minutes}
            onClick={() => safeRun(() => setIntervalMinutes(interval))}
            className="btn btn-secondary disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>

      {/* Card retention */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <div className="text-[14px] font-semibold text-ink-primary">Card retention</div>
          <p className="mt-1 max-w-md text-[11px] text-ink-muted">
            Hide trade cards from the dashboard once they reach a terminal outcome
            (WIN / LOSS / SKIP / NO_TRADE) and are older than N days.
            <span className="text-ink-secondary"> ข้อมูลในฐานข้อมูลยังเก็บครบ</span>{" "}
            — สถิติและ analytics ใช้ข้อมูลเต็มเสมอ. ตั้ง <span className="font-mono text-brand">0</span> = ไม่ archive
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={3650}
            value={retention}
            onChange={(e) => setRetention(Number(e.target.value))}
            className="h-9 w-20 rounded-chip border border-white/5 bg-surface-2/60 px-3 font-mono text-[13px] tabular text-ink-primary"
          />
          <span className="text-[12px] text-ink-muted">days</span>
          <button
            disabled={pending || retention === config.card_retention_days}
            onClick={() => safeRun(() => setCardRetentionDays(retention))}
            className="btn btn-secondary disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>

      {/* AI provider API keys */}
      <div className="card space-y-4 p-5">
        <div>
          <div className="flex items-center gap-2">
            <Icon name="key" size={14} className="text-sig-warn" />
            <span className="text-[14px] font-semibold text-ink-primary">
              AI provider API keys
            </span>
          </div>
          <p className="mt-1 max-w-xl text-[11px] text-ink-muted">
            ตั้งค่า key สำหรับแต่ละ provider โดยตรง — ไม่ต้องแก้ env แล้ว redeploy.
            Key จะ <span className="text-ink-secondary">ไม่ถูกแสดงเต็ม</span> ตอนโหลดหน้านี้ใหม่ ระบบเก็บปลอดภัยใน database (service-role only).
            ถ้าตั้งที่นี่ → จะ override env var โดยอัตโนมัติ.
          </p>
        </div>

        <ApiKeyRow
          label="OpenAI"
          providerLabel="OpenAI"
          status={apiKeys.openai}
          value={openaiKey}
          onChange={setOpenaiKey}
          placeholder="sk-proj-… (paste new key to replace)"
          pending={pending}
          onSave={() => safeRun(async () => { await setAiApiKey("openai", openaiKey); setOpenaiKey(""); setMsg("OpenAI key saved"); })}
          onClear={() => safeRun(async () => { await setAiApiKey("openai", null); setOpenaiKey(""); setMsg("OpenAI key cleared (env fallback active)"); })}
          helpUrl="https://platform.openai.com/api-keys"
        />

        <ApiKeyRow
          label="Google Gemini"
          providerLabel="Gemini"
          status={apiKeys.gemini}
          value={geminiKey}
          onChange={setGeminiKey}
          placeholder="AIza… (paste new key to replace)"
          pending={pending}
          onSave={() => safeRun(async () => { await setAiApiKey("gemini", geminiKey); setGeminiKey(""); setMsg("Gemini key saved"); })}
          onClear={() => safeRun(async () => { await setAiApiKey("gemini", null); setGeminiKey(""); setMsg("Gemini key cleared (env fallback active)"); })}
          helpUrl="https://aistudio.google.com/apikey"
        />
      </div>

      {/* AI model picker */}
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Icon name="robot" size={14} className="text-sig-violet" />
              <span className="text-[14px] font-semibold text-ink-primary">
                AI model
              </span>
              {(() => {
                const m = findModel(model);
                return m ? (
                  <span
                    className={`chip !text-[10px] ${
                      m.provider === "gemini" ? "chip-info" : "chip-buy"
                    }`}
                  >
                    {m.provider === "gemini" ? "Google" : "OpenAI"}
                  </span>
                ) : null;
              })()}
            </div>
            <p className="mt-1 max-w-xl text-[11px] text-ink-muted">
              เลือก AI provider + version ที่จะใช้วิเคราะห์ webhook. การเปลี่ยนมีผล{" "}
              <span className="text-ink-secondary">ทันทีกับ signal ถัดไป</span>.
              ต้องตั้ง env <code className="font-mono text-brand">OPENAI_API_KEY</code> หรือ{" "}
              <code className="font-mono text-brand">GEMINI_API_KEY</code> ให้ตรงกับ provider ที่เลือก.
            </p>
            {(() => {
              const m = findModel(model);
              if (!m?.description) return null;
              return (
                <p className="mt-2 text-[12px] text-ink-secondary">
                  รุ่นปัจจุบัน:{" "}
                  <span className="font-mono text-ink-primary">{m.label}</span>{" "}
                  — {m.description}
                </p>
              );
            })()}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="h-9 min-w-[240px] rounded-chip border border-white/5 bg-surface-2/60 px-3 font-mono text-[13px] text-ink-primary"
            >
              <optgroup label="OpenAI (GPT)">
                {AI_MODELS.filter((m) => m.provider === "openai").map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                    {m.recommended ? " ⭐" : ""}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Google Gemini">
                {AI_MODELS.filter((m) => m.provider === "gemini").map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                    {m.recommended ? " ⭐" : ""}
                  </option>
                ))}
              </optgroup>
            </select>
            <button
              disabled={pending || model === (config.ai_model || DEFAULT_AI_MODEL)}
              onClick={() => safeRun(() => setAiModel(model))}
              className="btn btn-secondary disabled:opacity-50"
            >
              Save model
            </button>
          </div>
        </div>
      </div>

      {/* Dual-model mode (run GPT + Gemini in parallel) */}
      <div className="card space-y-4 p-5">
        <div>
          <div className="flex items-center gap-2">
            <Icon name="device-analytics" size={14} className="text-sig-info" />
            <span className="text-[14px] font-semibold text-ink-primary">
              Dual-model comparison
            </span>
            <span
              className={`chip !text-[10px] ${
                config.ai_mode === "vote"
                  ? "chip-buy"
                  : config.ai_mode === "compare"
                  ? "chip-info"
                  : "chip-mute"
              }`}
            >
              {config.ai_mode === "vote"
                ? "Vote (consensus)"
                : config.ai_mode === "compare"
                ? "Compare (parallel)"
                : "Single (default)"}
            </span>
          </div>
          <p className="mt-1 max-w-xl text-[11px] text-ink-muted">
            รัน <span className="text-ink-secondary">GPT + Gemini พร้อมกัน</span>{" "}
            แล้วเปรียบเทียบผล. ⚠️ cost ×2 ของแต่ละ signal.
            <br />
            <span className="font-mono text-[10px]">single</span> = primary อย่างเดียว
            (default){" "}
            <span className="font-mono text-[10px]">compare</span> = ทั้งคู่ทำงาน
            แสดงทั้ง 2 ความเห็น{" "}
            <span className="font-mono text-[10px]">vote</span> = ส่ง Telegram เฉพาะตอนทั้ง 2 agree
          </p>
        </div>

        {/* Mode buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {[
            { key: "single" as const, label: "Single", desc: "primary เท่านั้น" },
            { key: "compare" as const, label: "Compare", desc: "ทั้ง 2 ตัว · ดูทั้งคู่" },
            { key: "vote" as const, label: "Vote", desc: "ต้อง agree ถึงส่ง" },
          ].map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setAiMode(m.key)}
              className={`h-9 rounded-chip border px-3 text-[12px] transition ${
                aiMode === m.key
                  ? "border-brand/40 bg-brand/15 text-brand"
                  : "border-white/5 bg-surface-2/60 text-ink-muted hover:text-ink-primary"
              }`}
            >
              <span className="font-semibold">{m.label}</span>
              <span className="ml-1.5 text-[10px] opacity-70">— {m.desc}</span>
            </button>
          ))}
        </div>

        {/* Secondary model picker — only relevant when not "single" */}
        {aiMode !== "single" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-eyebrow text-ink-muted">
              Secondary model:
            </span>
            <select
              value={secondaryModel}
              onChange={(e) => setSecondaryModel(e.target.value)}
              className="h-9 min-w-[240px] rounded-chip border border-white/5 bg-surface-2/60 px-3 font-mono text-[13px] text-ink-primary"
            >
              <optgroup label="OpenAI (GPT)">
                {AI_MODELS.filter((m) => m.provider === "openai").map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                    {m.recommended ? " ⭐" : ""}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Google Gemini">
                {AI_MODELS.filter((m) => m.provider === "gemini").map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                    {m.recommended ? " ⭐" : ""}
                  </option>
                ))}
              </optgroup>
            </select>
            <span className="text-[10px] text-ink-muted">
              {(() => {
                const m = findModel(secondaryModel);
                return m ? `${m.provider} · ${m.description ?? ""}` : "";
              })()}
            </span>
          </div>
        )}

        <div className="flex items-center justify-end">
          <button
            disabled={pending || !dualChanged}
            onClick={() => safeRun(() => setAiDualMode(aiMode, secondaryModel))}
            className="btn btn-secondary disabled:opacity-50"
          >
            Save mode
          </button>
        </div>
      </div>

      {/* Active trading plans — which Pine indicators are accepted right now */}
      <div className="card space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Icon name="filter" size={14} className="text-sig-info" />
              <h3 className="text-[13px] font-semibold uppercase tracking-eyebrow text-ink-secondary">
                Active trading plans
              </h3>
            </div>
            <p className="mt-1 max-w-xl text-[11px] text-ink-muted">
              เลือกได้มากกว่า 1 แผน — สัญญาณจาก plan ที่ปิดอยู่จะถูก{" "}
              <span className="text-ink-secondary">reject ทันที</span> (ไม่บันทึก, ไม่ส่ง Telegram, ไม่เรียก AI).
              NO_TRADE heartbeat ก็เงียบด้วย. ปิดทั้งหมด = kill switch.
            </p>
            <p className="mt-2 text-[12px] text-ink-secondary">
              สถานะ:{" "}
              <span className="font-mono text-ink-primary">
                {config.active_trading_plans.length === 0
                  ? "ปิดทั้งหมด (kill switch)"
                  : config.active_trading_plans
                      .map((k) => {
                        const def = plansCatalog.find((p) => p.key === k);
                        return def ? def.label : k;
                      })
                      .join(" + ")}
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {plansCatalog.length === 0 ? (
            <span className="text-[11px] text-ink-muted">
              ยังไม่มี plan ใน catalog — เพิ่มที่ส่วนด้านล่าง
            </span>
          ) : (
            plansCatalog.map((def) => {
              const active = plans.includes(def.key);
              const tgOff = def.telegram_enabled === false;
              return (
                <button
                  key={def.key}
                  type="button"
                  onClick={() => togglePlan(def.key)}
                  className={`h-9 rounded-chip border px-3 text-[12px] font-semibold transition ${
                    active
                      ? PLAN_COLOR_CLASSES[def.color]
                      : "border-white/5 bg-surface-2/60 text-ink-muted hover:text-ink-primary"
                  }`}
                  title={
                    (def.description ?? `signal_type:"${def.key}"`) +
                    (tgOff ? "\n📵 Telegram broadcast OFF — silent monitoring mode" : "")
                  }
                >
                  {def.emoji} {def.label}
                  {tgOff && (
                    <span className="ml-1.5 rounded bg-black/30 px-1 py-0.5 text-[9px] font-bold text-ink-faint">
                      📵 silent
                    </span>
                  )}
                </button>
              );
            })
          )}
          <button
            disabled={pending || !plansChanged}
            onClick={() => safeRun(() => setActiveTradingPlans(plans))}
            className="btn btn-secondary disabled:opacity-50"
          >
            Save plans
          </button>
        </div>

        {/* Catalog manager — admin can add/remove plans without code changes */}
        <PlansCatalogManager
          plansCatalog={plansCatalog}
          pending={pending}
          safeRun={safeRun}
        />
      </div>

      {/* Trending Top 3 alert toggle */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <div className="flex items-center gap-2">
            <Icon name="bell" size={14} className="text-sig-warn" />
            <h3 className="text-[13px] font-semibold uppercase tracking-eyebrow text-ink-secondary">
              Top 3 Trending Telegram alerts
            </h3>
            <span
              className={`pulse-dot ${config.trending_alert_enabled ? "" : "!bg-sig-warn"}`}
            />
            <span className="text-[11px] text-ink-muted">
              {config.trending_alert_enabled ? "ON" : "OFF"}
            </span>
          </div>
          <p className="mt-1 max-w-xl text-[11px] text-ink-muted">
            ส่ง Telegram เมื่อมีเหรียญใหม่ติด Top 3 hottest (Binance 24h % gain). ปิดเพื่อ
            ลด noise — snapshot ยัง update ต่อ ดังนั้นเปิดกลับมาก็ไม่ flood ย้อนหลัง.
          </p>
        </div>
        <button
          disabled={pending}
          onClick={() => safeRun(() => setTrendingAlertEnabled(!config.trending_alert_enabled))}
          className={`btn ${config.trending_alert_enabled ? "btn-secondary" : "btn-primary"} disabled:opacity-50`}
        >
          {config.trending_alert_enabled ? "Turn OFF" : "Turn ON"}
        </button>
      </div>

      {/* AI active schedule (multi-window + day-of-week) */}
      <div className="card space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Icon name="robot" size={14} className="text-sig-violet" />
              <span className="text-[14px] font-semibold text-ink-primary">
                AI active schedule
              </span>
              <span
                className={`chip !text-[10px] ${
                  currentlyActive ? "chip-buy" : "chip-warn"
                }`}
              >
                <span
                  className={`pulse-dot ${currentlyActive ? "" : "!bg-sig-warn"}`}
                />
                {currentlyActive ? "Active now" : "Idle now"}
              </span>
            </div>
            <p className="mt-1 max-w-xl text-[11px] text-ink-muted">
              นอกช่วงเวลา/วันที่ตั้ง webhook BUY/SELL จะถูก{" "}
              <span className="text-ink-secondary">เก็บเป็น Queue</span> รอ admin วิเคราะห์ทีหลัง —
              ไม่มี Telegram, ประหยัด API cost. NO_TRADE heartbeat ยังส่งปกติ. ไม่มี window = ทำงาน 24 ชม.
            </p>
            <p className="mt-2 text-[12px] text-ink-secondary">
              สถานะ: <span className="font-mono text-ink-primary">{describeWindows(config.ai_active_windows)}</span>
              {" · "}
              <span className="font-mono text-ink-primary">
                {config.ai_active_days.length === 7
                  ? "ทุกวัน"
                  : config.ai_active_days.map((d) => DAY_NAMES[d]).join(", ")}
              </span>
            </p>
          </div>
        </div>

        {/* Day picker */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-eyebrow text-ink-muted">
            Active days:
          </span>
          {DAY_LABELS.map((label, i) => {
            const active = days.includes(i);
            return (
              <button
                key={i}
                type="button"
                onClick={() => toggleDay(i)}
                className={`h-8 min-w-[36px] rounded-chip border px-2 text-[12px] font-semibold transition ${
                  active
                    ? "border-brand/40 bg-brand/15 text-brand"
                    : "border-white/5 bg-surface-2/60 text-ink-muted hover:text-ink-primary"
                }`}
              >
                {label}
              </button>
            );
          })}
          <button
            disabled={pending || !daysChanged}
            onClick={() => safeRun(() => setAiActiveDays(days))}
            className="btn btn-secondary disabled:opacity-50"
          >
            Save days
          </button>
        </div>

        {/* Window list */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-eyebrow text-ink-muted">
              Active hour windows
            </span>
            <button
              type="button"
              onClick={addWindow}
              disabled={windows.length >= 8}
              className="chip chip-info !text-[10px] disabled:opacity-40"
            >
              <Icon name="plus" size={10} />
              Add window
            </button>
          </div>

          {windows.length === 0 ? (
            <div className="rounded-chip border border-white/5 bg-surface-2/60 px-3 py-3 text-center text-[12px] text-ink-muted">
              ไม่มี window — AI ทำงานตลอด 24 ชั่วโมง (เมื่ออยู่ในวันที่กำหนด)
            </div>
          ) : (
            windows.map((w, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center gap-2 rounded-chip border border-white/5 bg-surface-2/40 px-3 py-2"
              >
                <span className="font-mono text-[11px] text-ink-muted">#{i + 1}</span>
                <select
                  value={w.start}
                  onChange={(e) => updateWindow(i, { start: Number(e.target.value) })}
                  className="h-8 rounded-chip border border-white/5 bg-surface-1 px-2 font-mono text-[12px] text-ink-primary"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                  ))}
                </select>
                <span className="text-[11px] text-ink-muted">→</span>
                <select
                  value={w.end}
                  onChange={(e) => updateWindow(i, { end: Number(e.target.value) })}
                  className="h-8 rounded-chip border border-white/5 bg-surface-1 px-2 font-mono text-[12px] text-ink-primary"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                  ))}
                </select>
                {w.start === w.end ? (
                  <span className="text-[11px] text-sig-info">= 24h</span>
                ) : w.start > w.end ? (
                  <span className="text-[11px] text-sig-warn">ข้ามคืน</span>
                ) : null}
                <button
                  type="button"
                  onClick={() => removeWindow(i)}
                  className="ml-auto rounded border border-sig-sell/30 bg-sig-sell/10 p-1 text-sig-sell hover:bg-sig-sell/20"
                  aria-label="Remove window"
                >
                  <Icon name="x" size={11} />
                </button>
              </div>
            ))
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              disabled={pending || !windowsChanged}
              onClick={() => safeRun(() => setAiActiveWindows(windows))}
              className="btn btn-secondary disabled:opacity-50"
            >
              Save windows
            </button>
          </div>
        </div>

        {/* Process queued */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-3">
          <div>
            <div className="text-[13px] font-semibold text-ink-primary">
              Queued signals
              {queuedCount > 0 && (
                <span className="ml-2 inline-flex h-5 min-w-[22px] items-center justify-center rounded-full bg-sig-info/15 px-1.5 text-[10px] font-bold text-sig-info">
                  {queuedCount}
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-ink-muted">
              {queuedCount === 0
                ? "ไม่มี webhook ที่รอวิเคราะห์ในขณะนี้"
                : `webhook ${queuedCount} รายการกำลังรอ AI วิเคราะห์ (เก็บไว้ตอน AI หลับ) — กดเพื่อ batch process`}
            </p>
          </div>
          <button
            disabled={pending || queuedCount === 0}
            onClick={() =>
              safeRun(async () => {
                const data = (await processQueuedSignals()) as {
                  ok?: boolean;
                  processed?: number;
                  filtered?: number;
                  telegrams_sent?: number;
                  errors?: number;
                  error?: string;
                };
                if (data?.ok === false) {
                  setMsg(`Error: ${data.error}`);
                } else {
                  setMsg(
                    `Processed ${data?.processed ?? 0} · filtered ${data?.filtered ?? 0} · sent ${data?.telegrams_sent ?? 0} Telegram · ${data?.errors ?? 0} errors`
                  );
                }
              })
            }
            className="btn btn-primary disabled:opacity-50"
          >
            <Icon name="lightning" size={14} />
            {pending ? "Processing…" : `Process queue${queuedCount > 0 ? ` (${queuedCount})` : ""}`}
          </button>
        </div>
      </div>

      {/* Run now */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <div className="text-[14px] font-semibold text-ink-primary">Manual trigger</div>
          <p className="mt-1 text-[11px] text-ink-muted">
            กดเพื่อรัน backtest ทันที (จะ override pause flag)
          </p>
        </div>
        <button
          disabled={pending}
          onClick={() =>
            safeRun(async () => {
              const data = (await triggerRunNow()) as {
                ok?: boolean;
                evaluated?: number;
                win?: number;
                loss?: number;
                open?: number;
                win_rate_pct?: number | null;
                error?: string;
              };
              if (data?.ok === false) {
                setMsg(`Error: ${data.error}`);
              } else {
                setMsg(
                  `Ran: evaluated ${data?.evaluated ?? 0} · ${data?.win ?? 0}W / ${
                    data?.loss ?? 0
                  }L / ${data?.open ?? 0}O · win-rate ${data?.win_rate_pct ?? "-"}%`
                );
              }
            })
          }
          className="btn btn-primary disabled:opacity-60"
        >
          <Icon name="lightning" size={14} />
          {pending ? "Running…" : "Run backtest now"}
        </button>
      </div>

      {msg && (
        <p className="rounded-chip border border-white/5 bg-surface-1 px-3 py-2 text-[12px] text-ink-secondary">
          {msg}
        </p>
      )}
    </div>
  );
}

function ApiKeyRow({
  label,
  providerLabel,
  status,
  value,
  onChange,
  placeholder,
  pending,
  onSave,
  onClear,
  helpUrl,
}: {
  label: string;
  providerLabel: string;
  status: MaskedApiKeys["openai"];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  pending: boolean;
  onSave: () => void;
  onClear: () => void;
  helpUrl: string;
}) {
  const sourceBadge =
    status.source === "db"
      ? { label: "DB", className: "chip-buy" }
      : status.source === "env"
      ? { label: "ENV", className: "chip-info" }
      : { label: "Not set", className: "chip-warn" };

  return (
    <div className="rounded-chip border border-white/5 bg-surface-2/40 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold text-ink-primary">{label}</span>
        <span className={`chip !text-[10px] ${sourceBadge.className}`}>
          {sourceBadge.label}
        </span>
        {status.configured && status.mask && (
          <span className="font-mono text-[11px] text-ink-muted">{status.mask}</span>
        )}
        <a
          href={helpUrl}
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex items-center gap-1 text-[11px] text-brand hover:underline"
        >
          <Icon name="external" size={11} />
          Get key
        </a>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="new-password"
          className="h-9 flex-1 min-w-[200px] rounded-chip border border-white/5 bg-surface-1 px-3 font-mono text-[12px] text-ink-primary placeholder:text-ink-faint"
        />
        <button
          disabled={pending || value.trim().length === 0}
          onClick={onSave}
          className="btn btn-secondary disabled:opacity-50"
        >
          Save
        </button>
        {status.source === "db" && (
          <button
            disabled={pending}
            onClick={onClear}
            className="btn !bg-sig-sell/10 !border-sig-sell/30 !text-sig-sell hover:!bg-sig-sell/20 disabled:opacity-50"
          >
            Clear
          </button>
        )}
      </div>
      <p className="mt-1.5 text-[10px] text-ink-faint">
        {status.source === "db"
          ? `${providerLabel} key มาจาก database — override env var`
          : status.source === "env"
          ? `${providerLabel} key มาจาก env var — แทนที่ได้โดยใส่ key ใหม่`
          : `ยังไม่ได้ตั้ง ${providerLabel} key — ใส่ที่นี่หรือตั้ง env var`}
      </p>
    </div>
  );
}

// ─── Plans Catalog Manager ─────────────────────────────────────────────
// Admin add / delete plans without code changes. Default plans (swing,
// intraday) are protected from deletion — they back the live indicators
// we ship. Custom plans (e.g., scalp30) admin can add and remove freely.
function PlansCatalogManager({
  plansCatalog,
  pending,
  safeRun,
}: {
  plansCatalog: TradingPlanDef[];
  pending: boolean;
  safeRun: (fn: () => Promise<unknown>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newEmoji, setNewEmoji] = useState("🟢");
  const [newColor, setNewColor] = useState<TradingPlanDef["color"]>("brand");
  const [newDescription, setNewDescription] = useState("");
  const colorOptions: TradingPlanDef["color"][] = ["info", "violet", "warn", "buy", "sell", "brand"];

  const resetForm = () => {
    setNewKey("");
    setNewLabel("");
    setNewEmoji("🟢");
    setNewColor("brand");
    setNewDescription("");
  };

  const submit = () => {
    const def: TradingPlanDef = {
      key: newKey.trim(),
      label: newLabel.trim(),
      emoji: newEmoji.trim(),
      color: newColor,
      description: newDescription.trim() || undefined,
    };
    safeRun(async () => {
      const res = await addTradingPlan(def);
      resetForm();
      return res;
    });
  };

  return (
    <div className="rounded-chip border border-white/5 bg-surface-2/30 p-3">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-eyebrow text-ink-muted">
            Manage plans catalog
          </span>
          <p className="mt-0.5 text-[10px] text-ink-faint">
            เพิ่ม plan ใหม่ของตัวเอง (เช่น TF30 scalp) — ใช้ใน Pine
            payload <code>{"\"signal_type\":\"<key>\""}</code>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="chip !text-[11px]"
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          {/* Existing plans */}
          <div className="space-y-1.5">
            {plansCatalog.map((def) => {
              const isDefault = (DEFAULT_TRADING_PLAN_KEYS as readonly string[]).includes(def.key);
              const tgOn = def.telegram_enabled !== false;
              return (
                <div
                  key={def.key}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border border-white/5 bg-surface-1/50 px-3 py-2 text-[12px]"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="text-base">{def.emoji}</span>
                    <span className="font-semibold text-ink-primary">{def.label}</span>
                    <code className="rounded bg-black/30 px-1.5 py-0.5 text-[10px] text-ink-muted">
                      {def.key}
                    </code>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => safeRun(() => setPlanTelegramEnabled(def.key, !tgOn))}
                      className={`chip !text-[10px] ${
                        tgOn
                          ? "!border-sig-buy/40 !bg-sig-buy/15 !text-sig-buy"
                          : "!border-white/15 !bg-surface-2/60 !text-ink-muted"
                      }`}
                      title={
                        tgOn
                          ? "Telegram broadcast เปิดอยู่ — คลิกเพื่อปิด (ยัง track stats ปกติ)"
                          : "Telegram broadcast ปิดอยู่ — คลิกเพื่อเปิด"
                      }
                    >
                      📨 {tgOn ? "TG: ON" : "TG: OFF"}
                    </button>
                    <span className="text-[10px] text-ink-faint">
                      color: <code>{def.color}</code>
                    </span>
                    {isDefault ? (
                      <span className="chip chip-mute !text-[10px]" title="ลบไม่ได้ — เป็น plan default ของระบบ">
                        protected
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          if (confirm(`ลบ plan "${def.label}" (key: ${def.key})?`)) {
                            safeRun(() => removeTradingPlan(def.key));
                          }
                        }}
                        className="chip !text-[10px] hover:!text-sig-sell"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add new plan form */}
          <div className="rounded border border-white/5 bg-surface-1/50 p-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-eyebrow text-ink-muted">
              + Add new plan
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-[11px] text-ink-muted">
                Key (a-z, 0-9, _ ; 2-32 chars)
                <input
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value.toLowerCase())}
                  placeholder="scalp30"
                  className="rounded border border-white/10 bg-surface-2 px-2 py-1.5 text-[12px] text-ink-primary"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-ink-muted">
                Label (max 60)
                <input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Scalp · 30m"
                  className="rounded border border-white/10 bg-surface-2 px-2 py-1.5 text-[12px] text-ink-primary"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-ink-muted">
                Emoji
                <input
                  value={newEmoji}
                  onChange={(e) => setNewEmoji(e.target.value)}
                  placeholder="🟢"
                  className="rounded border border-white/10 bg-surface-2 px-2 py-1.5 text-[12px] text-ink-primary"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-ink-muted">
                Color
                <select
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value as TradingPlanDef["color"])}
                  className="rounded border border-white/10 bg-surface-2 px-2 py-1.5 text-[12px] text-ink-primary"
                >
                  {colorOptions.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-ink-muted sm:col-span-2">
                Description (optional, max 200)
                <input
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="30m EMA21/55 scalp — Pine custom"
                  className="rounded border border-white/10 bg-surface-2 px-2 py-1.5 text-[12px] text-ink-primary"
                />
              </label>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-[10px] text-ink-faint">
                preview: <span className="ml-1 text-ink-primary">{newEmoji} {newLabel || "label"}</span>
                <code className="ml-2 rounded bg-black/30 px-1.5 py-0.5">{newKey || "key"}</code>
              </span>
              <button
                type="button"
                disabled={pending || !newKey.trim() || !newLabel.trim() || !newEmoji.trim()}
                onClick={submit}
                className="btn btn-primary disabled:opacity-50"
              >
                Add plan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
