"use client";

import { useState } from "react";
import Link from "next/link";
import Icon, { type IconName } from "@/components/ui/Icon";

type Role = "user" | "admin";

interface Section {
  id: string;
  title: string;
  icon: IconName;
  intro?: string;
  steps?: Step[];
  callouts?: Callout[];
  table?: TableSpec;
  faq?: { q: string; a: React.ReactNode }[];
}

interface Step {
  title: string;
  body: React.ReactNode;
  icon?: IconName;
}

interface Callout {
  tone: "info" | "warn" | "buy" | "sell";
  icon?: IconName;
  text: React.ReactNode;
}

interface TableSpec {
  headers: string[];
  rows: (string | React.ReactNode)[][];
}

const USER_SECTIONS: Section[] = [
  {
    id: "u-login",
    title: "เข้าสู่ระบบ (Login)",
    icon: "login",
    intro:
      "ระบบใช้ OTP ผ่าน Telegram — ไม่มีรหัสผ่าน แค่กรอก username แล้วรอรับรหัส 4 หลัก",
    steps: [
      {
        title: "พิมพ์ username",
        icon: "user",
        body: "เปิด /login → กรอก username ที่ admin สร้างให้",
      },
      {
        title: "รับรหัสจาก Telegram",
        icon: "send",
        body: "กดปุ่ม 'ส่งรหัสไปที่ Telegram' → bot จะส่งรหัส 4 หลักเข้า chat ภายใน 1-2 วินาที",
      },
      {
        title: "กรอกรหัส",
        icon: "key",
        body: "พิมพ์เลข 4 หลัก (ระบบ submit อัตโนมัติเมื่อครบ 4 ตัว) → เข้า dashboard ได้ทันที",
      },
    ],
    callouts: [
      {
        tone: "warn",
        icon: "clock",
        text: "รหัสหมดอายุใน 5 นาที · ขอใหม่ได้ไม่เกิน 3 ครั้งใน 10 นาที",
      },
      {
        tone: "info",
        icon: "shield-check",
        text: "Session อายุ 1 วัน — หลังจากนั้นต้อง login ใหม่",
      },
    ],
  },
  {
    id: "u-dashboard",
    title: "Dashboard — ดู signals",
    icon: "dashboard",
    intro:
      "หน้าหลักแสดง signals ทั้งหมดในรูปแบบ card — แต่ละ card คือสัญญาณซื้อ/ขายจาก TradingView ที่ AI วิเคราะห์แล้ว",
    steps: [
      {
        title: "KPI tiles ด้านบน",
        icon: "device-analytics",
        body: "Total / Wins / Losses / Open / Win rate / Total PnL — animated count-up เมื่อข้อมูลเปลี่ยน",
      },
      {
        title: "Filter chips",
        icon: "filter",
        body: "All / Open / Wins / Losses / No Trade — กดเพื่อกรอง signal ตาม outcome",
      },
      {
        title: "Trade card",
        icon: "chart-candle",
        body: "แต่ละการ์ดแสดง: symbol + price + AI bias + R:R + ระดับ Entry/SL/TP1/TP2 + outcome + PnL",
      },
    ],
    callouts: [
      {
        tone: "info",
        icon: "info",
        text: (
          <>
            การ์ด <strong>ที่มีแถบ mint ด้านซ้าย + shimmer</strong> = signal ใหม่ (ภายใน 1 ชั่วโมงล่าสุด)
          </>
        ),
      },
    ],
  },
  {
    id: "u-bias",
    title: "อ่าน AI bias",
    icon: "robot",
    intro: "AI วิเคราะห์ทุก signal และให้คำแนะนำ 3 แบบ:",
    table: {
      headers: ["Bias", "ความหมาย", "ควรทำอะไร"],
      rows: [
        [
          <span key="long" className="chip chip-buy !text-[10px]">LONG</span>,
          "AI แนะนำให้ซื้อ",
          "เข้า BUY ตาม Entry zone",
        ],
        [
          <span key="short" className="chip chip-sell !text-[10px]">SHORT</span>,
          "AI แนะนำให้ขาย",
          "เข้า SELL ตาม Entry zone",
        ],
        [
          <span key="wait" className="chip chip-warn !text-[10px]">WAIT</span>,
          "AI ไม่แนะนำให้เข้า",
          "อยู่เฉยๆ — รอ signal ที่ชัดเจนกว่า",
        ],
      ],
    },
    callouts: [
      {
        tone: "warn",
        icon: "alert-triangle",
        text: "Signal ที่ AI = WAIT จะส่ง Telegram เป็น 'NO TRADE — ไม่แนะนำให้เข้า' พร้อม banner แดง",
      },
      {
        tone: "info",
        icon: "target",
        text: "Confidence สูงกว่า 70% = AI มั่นใจมาก · 50-70% = กลางๆ · ต่ำกว่า 50% = อ่อน",
      },
    ],
  },
  {
    id: "u-trending",
    title: "Trending crypto",
    icon: "flame",
    intro:
      "ดู Top 5 USDT pairs จาก Binance ใน 4 หมวด + watchlist ส่วนตัว · refresh อัตโนมัติทุก 30 วินาที",
    steps: [
      {
        title: "เลือก tab",
        icon: "filter",
        body: "Hottest (price × volume) / Top gainers / Most traded / Top losers / Watchlist",
      },
      {
        title: "Filter เพิ่มเติม",
        icon: "diamond",
        body: "All / No memecoins / Blue chips — ใช้ตอนอยากให้ระบบโชว์เฉพาะเหรียญ blue chip",
      },
      {
        title: "เพิ่มเข้า Watchlist",
        icon: "star",
        body: "คลิกดาว ☆ ที่ card → เปลี่ยนเป็น ★ (เพิ่มเข้าแล้ว) — เก็บแยกต่อ user",
      },
      {
        title: "ให้ AI วิเคราะห์",
        icon: "robot",
        body: "กด 'Analyze with AI' → AI สร้าง signal + ส่ง Telegram ทันที (ใช้ราคา + 24h context)",
      },
    ],
    callouts: [
      {
        tone: "info",
        icon: "info",
        text: "Sparkline ใน card คือ price chart 24 ชั่วโมงล่าสุด (24 จุด, hourly)",
      },
    ],
  },
  {
    id: "u-analytics",
    title: "Analytics",
    icon: "device-analytics",
    intro:
      "สถิติและกราฟทุกแบบ — ใช้ดูว่าระบบทำงานเป็นยังไง · ทุก user เข้าได้ (read-only)",
    steps: [
      {
        title: "12 KPI tiles",
        icon: "scale",
        body: "Total · Decided · Win rate · Total PnL · Avg PnL · Profit factor · Best/Worst trade · Avg R:R · Max drawdown · Win/Loss streak",
      },
      {
        title: "Charts",
        icon: "chart-line",
        body: "Equity curve · Outcome donut · Daily PnL · Rolling win rate · Top symbols · By timeframe · Confidence vs Win rate · Hour-of-day heatmap",
      },
    ],
    callouts: [
      {
        tone: "info",
        icon: "info",
        text: "ข้อมูลนับเฉพาะ signal ที่ outcome = WIN_TP1 / WIN_TP2 / LOSS_SL · ไม่รวม PENDING / OPEN / NO TRADE",
      },
    ],
  },
  {
    id: "u-telegram",
    title: "Telegram alerts",
    icon: "telegram",
    intro:
      "Active user ทุกคนจะได้รับ Telegram alert พร้อมกัน — ไม่ต้อง config อะไรเพิ่ม",
    table: {
      headers: ["Alert type", "เมื่อไหร่ที่ได้รับ"],
      rows: [
        ["🚨 Signal alert", "TradingView ยิง signal มา + AI วิเคราะห์เสร็จ"],
        ["⛔ NO TRADE", "AI วิเคราะห์แล้วไม่แนะนำให้เข้า"],
        ["🔥 Top 3 newcomer", "ทุก 30 นาที — ถ้ามีเหรียญใหม่เข้า Top 3 hottest"],
        ["🔐 OTP code", "เฉพาะตอนคุณ login (ส่งให้คนที่ขอเท่านั้น)"],
        ["👋 Welcome", "เมื่อส่ง /start หา bot ครั้งแรก"],
      ],
    },
    callouts: [
      {
        tone: "warn",
        icon: "ban",
        text: "ถ้าไม่อยากรับ alert ชั่วคราว → admin สามารถ disable account ได้ (account ที่ disabled จะไม่รับ alert + login ไม่ได้)",
      },
    ],
  },
];

const ADMIN_SECTIONS: Section[] = [
  {
    id: "a-overview",
    title: "Admin overview",
    icon: "shield-check",
    intro:
      "Admin มีสิทธิ์ทำทุกอย่างที่ user ทำได้ + จัดการระบบ + แก้ไข signal — ระบบป้องกัน self-lockout (admin คนสุดท้าย demote ตัวเองไม่ได้)",
    table: {
      headers: ["Feature", "User", "Admin"],
      rows: [
        ["ดู signals + analytics + trending", "✅", "✅"],
        ["Watchlist (ของตัวเอง)", "✅", "✅"],
        ["Analyze with AI", "✅", "✅"],
        ["รับ Telegram alerts", "✅", "✅"],
        ["Edit SL/TP per signal", "❌", "✅"],
        ["Delete signal (เดี่ยว/รวม)", "❌", "✅"],
        ["Run backtest manually", "❌", "✅"],
        ["Pause/Resume schedule", "❌", "✅"],
        ["Manage users (CRUD)", "❌", "✅"],
        ["Toggle admin role", "❌", "✅"],
        ["Setup Telegram webhook", "❌", "✅"],
        ["Test broadcast", "❌", "✅"],
      ],
    },
  },
  {
    id: "a-users",
    title: "จัดการ Users & Telegram contacts",
    icon: "users",
    intro: "ที่หน้า /dashboard/users — สร้าง user ใหม่จาก contact ที่ส่ง /start หา bot",
    steps: [
      {
        title: "ผู้ใช้ใหม่ส่ง /start หา bot",
        icon: "telegram",
        body: "Bot ตอบกลับพร้อม Chat ID + แจ้ง 'รอ admin อนุมัติ' — contact จะปรากฏในตาราง 'Telegram contacts' ทันที",
      },
      {
        title: "Create user จาก contact",
        icon: "user-plus",
        body: "ที่ row contact → กด '+ Create user' → ตั้ง username (auto-suggest) + display name + ติ๊ก admin (ถ้าต้องการ) → กด Create",
      },
      {
        title: "Toggle active/admin",
        icon: "settings",
        body: "ที่ตาราง Auth users → คลิก chip 'active' หรือ 'admin' เพื่อ toggle",
      },
      {
        title: "ลบ contact",
        icon: "trash",
        body: "Contact ที่ไม่ต้องการ → กดถังขยะ (user ที่ผูกอยู่ไม่ถูกลบ FK on delete set null)",
      },
    ],
    callouts: [
      {
        tone: "info",
        icon: "info",
        text: "Username pattern: a-z, A-Z, 0-9, _, - · ความยาว 2-40 ตัวอักษร",
      },
      {
        tone: "warn",
        icon: "shield",
        text: "Self-lockout protection: deactivate ตัวเองไม่ได้ + demote ตัวเองตอนเป็น admin คนเดียวไม่ได้",
      },
      {
        tone: "buy",
        icon: "circle-check",
        text: "Auto-link: ถ้า contact's chat_id ตรงกับ auth_user เก่าอยู่แล้ว → link อัตโนมัติเป็น 'registered'",
      },
    ],
  },
  {
    id: "a-webhook",
    title: "Telegram webhook",
    icon: "robot",
    intro:
      "ตั้งค่า webhook ให้ Telegram ส่ง message ทุกอันที่ส่งหา bot มาที่ /api/telegram/bot — ไม่ตั้งจะรับ contact ใหม่ไม่ได้",
    steps: [
      {
        title: "Setup ครั้งแรก",
        icon: "play",
        body: "ที่ /dashboard/users → panel 'Telegram Bot Webhook' → กด 'Setup webhook' → status เปลี่ยนเป็น Active",
      },
      {
        title: "Test broadcast",
        icon: "send",
        body: "กด 'Test broadcast' → ส่งข้อความทดสอบไปทุก active user เพื่อ verify multi-user delivery",
      },
      {
        title: "Re-register",
        icon: "refresh",
        body: "เปลี่ยน TELEGRAM_WEBHOOK_SECRET หรือ domain → กด 'Re-register' ให้ Telegram รู้ค่าใหม่",
      },
      {
        title: "Delete (maintenance)",
        icon: "trash",
        body: "ปิด webhook ชั่วคราว — bot จะไม่รับ message จนกว่าจะ Setup ใหม่",
      },
    ],
    callouts: [
      {
        tone: "warn",
        icon: "alert-triangle",
        text: "Telegram จำกัด setWebhook ที่ 1 ครั้งต่อนาที — อย่ากดถี่",
      },
    ],
  },
  {
    id: "a-signals",
    title: "Edit / Delete signals",
    icon: "edit",
    intro:
      "Admin เท่านั้นที่ edit ระดับราคา + ลบ signal ได้ — server-action guards ปกป้องทุกชั้น",
    steps: [
      {
        title: "Edit SL/TP/Entry",
        icon: "edit",
        body: "ที่ trade card → กดปุ่ม edit (ดินสอ) → modal เปิด → แก้ตัวเลข → live R:R preview → Save",
      },
      {
        title: "ผลของ Edit",
        icon: "refresh",
        body: "Outcome reset เป็น PENDING → backtest รอบถัดไปคำนวณใหม่ด้วยค่าใหม่ (ไม่ต้องรอ Cloud Scheduler)",
      },
      {
        title: "Delete เดี่ยว",
        icon: "trash",
        body: "กดถังขยะที่ trade card → confirm dialog → ลบถาวร (ลบ tradingview_signals + ai_signal_analysis ผ่าน cascade)",
      },
      {
        title: "Bulk delete",
        icon: "check",
        body: "ติ๊ก checkbox มุมขวาบนของ card หลายๆ ตัว → toolbar 'Delete selected (N)' โผล่ขึ้น → confirm",
      },
    ],
    callouts: [
      {
        tone: "warn",
        icon: "alert-triangle",
        text: "Bias-aware validation: LONG ต้อง SL < TP1 < TP2 · SHORT ต้อง SL > TP1 > TP2 · ป้องกันใส่ค่าผิดทาง",
      },
    ],
  },
  {
    id: "a-schedule",
    title: "Backtest schedule",
    icon: "clock",
    intro:
      "ระบบ backtest อัตโนมัติทุก 15 นาที (Cloud Scheduler) — ใช้ Binance public klines · first-touch model",
    steps: [
      {
        title: "Status",
        icon: "info",
        body: "Active (รัน auto) / Paused (skip ทันทีโดยไม่กระทบ Cloud Scheduler)",
      },
      {
        title: "Pause / Resume",
        icon: "pause",
        body: "Pause → API ตอบ {ok:true, skipped:true} ทันที · กรอก reason เพื่อ log ไว้",
      },
      {
        title: "Run backtest now",
        icon: "lightning",
        body: "Trigger manual — override pause flag · มีปุ่มที่ /dashboard ด้วย (Run backtest / Re-evaluate all)",
      },
      {
        title: "Recent runs",
        icon: "history",
        body: "ดู 20 runs ล่าสุด: เวลา, trigger (cron/manual), evaluated, W/L/O, win rate, duration, error",
      },
    ],
    callouts: [
      {
        tone: "info",
        icon: "info",
        text: "Display interval ในหน้านี้เป็นเพียงตัวเลขแสดง — ความถี่จริงตั้งจาก Cloud Scheduler",
      },
    ],
  },
  {
    id: "a-tradingview",
    title: "TradingView setup",
    icon: "chart-line",
    intro:
      "Pine Script → webhook → AI → Telegram pipeline · ตั้งค่าครั้งเดียวพอ",
    steps: [
      {
        title: "Pine Script",
        icon: "chart-candle",
        body: "ใช้ไฟล์ pine/btc_futures_signal_v2.pine · ปรับ inputs (ADX/RSI/Volume/HTF) ตาม preset · secret = TRADINGVIEW_WEBHOOK_SECRET",
      },
      {
        title: "TradingView Alert",
        icon: "bell",
        body: "Condition: 'BTC Futures BUY/SELL Webhook Alert v2' + 'Any alert() function call' · Trigger: Once Per Bar Close · Webhook URL: https://tradesure.d2infinite.com/api/webhook/tradingview · Message: เว้นว่าง",
      },
      {
        title: "Plan requirement",
        icon: "diamond",
        body: "Free / Essential plan ใช้ webhook ไม่ได้ — ต้อง Pro+ ขึ้นไป",
      },
    ],
    callouts: [
      {
        tone: "info",
        icon: "info",
        text: "Webhook ตอบ TradingView ภายใน <500ms (fire-and-forget) — AI วิเคราะห์ + Telegram ทำใน background",
      },
    ],
  },
  {
    id: "a-architecture",
    title: "System architecture",
    icon: "device-analytics",
    intro: "ภาพรวม system stack ของ Tradesure",
    table: {
      headers: ["Component", "Tech", "Provider"],
      rows: [
        ["Frontend", "Next.js 14 App Router + TS + Tailwind", "Firebase App Hosting"],
        ["Database", "PostgreSQL", "Supabase"],
        ["AI", "GPT-4o-mini (Chat Completions JSON mode)", "OpenAI"],
        ["Backtest data", "Public klines API (no key)", "Binance"],
        ["Auth", "OTP via Telegram + HMAC signed cookie", "Self-hosted"],
        ["Cron", "Cloud Scheduler (15m backtest, 30m trending)", "Google Cloud"],
        ["Notifications", "Bot API broadcast", "Telegram"],
        ["Domain + SSL", "tradesure.d2infinite.com", "DNS @ HostAtom + Firebase SSL"],
      ],
    },
  },
  {
    id: "a-troubleshoot",
    title: "Troubleshooting",
    icon: "alert-triangle",
    intro: "ปัญหาที่พบบ่อยและวิธีแก้",
    faq: [
      {
        q: "TradingView ขึ้น 'request took too long and timed out'",
        a: (
          <>
            ✅ <strong>แก้แล้ว</strong> — webhook ตอบภายใน &lt;500ms ด้วย fire-and-forget pattern · AI/Telegram ทำใน background
          </>
        ),
      },
      {
        q: "User ไม่ได้รับ Telegram signal alert",
        a: (
          <>
            เช็ค: 1) account active อยู่ไหม 2) chat_id ใน auth_users ตรงกับ chat ที่ login 3) ลอง 'Test broadcast' ที่ /dashboard/users
          </>
        ),
      },
      {
        q: "Bot ไม่ตอบเมื่อส่ง /start",
        a: (
          <>
            เช็ค Telegram webhook status ที่ /dashboard/users — ถ้า status ≠ Active ให้กด 'Setup webhook' ใหม่
          </>
        ),
      },
      {
        q: "Backtest ไม่อัปเดต outcome",
        a: (
          <>
            1) เช็ค schedule status — ถ้า Paused → Resume 2) signal time อยู่ในอดีตหรือยัง (ต้องมี klines หลัง signal time) 3) ดู Recent runs ที่ /dashboard/schedule ว่ามี error ไหม
          </>
        ),
      },
      {
        q: "AI bias = WAIT บ่อยเกินไป",
        a: (
          <>
            ดู /dashboard/analytics → Confidence vs Win rate — ถ้า confidence ของ WAIT สูง = AI ระมัดระวังถูก · ถ้า correlation ลบ = ปรับ AI prompt ใน lib/ai/analyzeCryptoSignal.ts
          </>
        ),
      },
    ],
  },
];

export default function HelpClient() {
  const [role, setRole] = useState<Role>("user");
  const sections = role === "user" ? USER_SECTIONS : ADMIN_SECTIONS;
  const [active, setActive] = useState(sections[0].id);

  return (
    <>
      <header className="mb-7">
        <div className="eyebrow">Documentation</div>
        <h1 className="mt-1 text-[24px] font-bold tracking-tightest text-ink-primary sm:text-[32px]">
          คู่มือการใช้งาน
        </h1>
        <p className="mt-1 text-[13px] text-ink-secondary">
          วิธีใช้งานระบบ Tradesure แยกตาม role · เลือก tab เพื่อสลับมุมมอง
        </p>
      </header>

      {/* Role tabs */}
      <div className="mb-6 inline-flex rounded-chip border border-white/5 bg-surface-1/60 p-1">
        <button
          type="button"
          onClick={() => {
            setRole("user");
            setActive(USER_SECTIONS[0].id);
          }}
          className={`flex items-center gap-2 rounded-chip px-4 py-2 text-[13px] font-semibold transition ${
            role === "user"
              ? "bg-brand/15 text-brand shadow-glow"
              : "text-ink-secondary hover:bg-surface-2 hover:text-ink-primary"
          }`}
        >
          <Icon name="user" size={14} />
          User Guide
        </button>
        <button
          type="button"
          onClick={() => {
            setRole("admin");
            setActive(ADMIN_SECTIONS[0].id);
          }}
          className={`flex items-center gap-2 rounded-chip px-4 py-2 text-[13px] font-semibold transition ${
            role === "admin"
              ? "bg-sig-warn/15 text-sig-warn shadow-glow"
              : "text-ink-secondary hover:bg-surface-2 hover:text-ink-primary"
          }`}
        >
          <Icon name="shield-check" size={14} />
          Admin Guide
          <span className="rounded bg-sig-warn/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-eyebrow">
            staff
          </span>
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        {/* TOC */}
        <aside className="sticky top-[80px] hidden h-fit lg:block">
          <div className="card p-3">
            <div className="mb-2 px-2 eyebrow">On this page</div>
            <nav className="space-y-1">
              {sections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  onClick={() => setActive(s.id)}
                  className={`flex items-center gap-2 rounded-chip px-3 py-2 text-[12px] transition ${
                    active === s.id
                      ? "bg-brand/10 text-brand"
                      : "text-ink-secondary hover:bg-surface-2 hover:text-ink-primary"
                  }`}
                >
                  <Icon name={s.icon} size={13} />
                  <span className="line-clamp-1">{s.title}</span>
                </a>
              ))}
            </nav>
          </div>

          <div className="card mt-4 p-4 text-[11px]">
            <div className="mb-2 flex items-center gap-2">
              <Icon name="lightning" size={12} className="text-sig-warn" />
              <span className="eyebrow">Quick links</span>
            </div>
            <ul className="space-y-1.5">
              <li>
                <Link href="/dashboard" className="text-brand hover:underline">
                  Dashboard
                </Link>
              </li>
              <li>
                <Link href="/dashboard/analytics" className="text-brand hover:underline">
                  Analytics
                </Link>
              </li>
              <li>
                <Link href="/dashboard/trending" className="text-brand hover:underline">
                  Trending
                </Link>
              </li>
              {role === "admin" && (
                <>
                  <li>
                    <Link href="/dashboard/users" className="text-brand hover:underline">
                      Users
                    </Link>
                  </li>
                  <li>
                    <Link href="/dashboard/schedule" className="text-brand hover:underline">
                      Schedule
                    </Link>
                  </li>
                </>
              )}
            </ul>
          </div>
        </aside>

        {/* Content */}
        <div className="min-w-0 space-y-8">
          {sections.map((s) => (
            <SectionBlock key={s.id} section={s} />
          ))}
        </div>
      </div>
    </>
  );
}

function SectionBlock({ section }: { section: Section }) {
  return (
    <section id={section.id} className="card p-6 scroll-mt-20">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-chip bg-brand/15 text-brand">
          <Icon name={section.icon} size={18} />
        </span>
        <h2 className="text-[20px] font-bold tracking-tightest text-ink-primary">
          {section.title}
        </h2>
      </div>

      {section.intro && (
        <p className="mb-5 text-[13px] text-ink-secondary">{section.intro}</p>
      )}

      {section.steps && (
        <ol className="mb-5 space-y-3">
          {section.steps.map((step, i) => (
            <li
              key={i}
              className="flex gap-3 rounded-card border border-white/5 bg-surface-2/30 p-4"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/15 text-[12px] font-bold text-brand">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-ink-primary">
                  {step.icon && (
                    <Icon name={step.icon} size={14} className="text-ink-secondary" />
                  )}
                  {step.title}
                </div>
                <div className="mt-1 text-[12px] text-ink-secondary">{step.body}</div>
              </div>
            </li>
          ))}
        </ol>
      )}

      {section.table && (
        <div className="mb-5 overflow-x-auto rounded-card border border-white/5 bg-surface-2/20">
          <table className="min-w-full divide-y divide-white/5 text-[12px]">
            <thead className="bg-surface-2/40 text-left">
              <tr>
                {section.table.headers.map((h) => (
                  <th key={h} className="px-4 py-2.5 eyebrow !text-[10px]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {section.table.rows.map((row, i) => (
                <tr key={i} className="hover:bg-surface-2/30">
                  {row.map((cell, j) => (
                    <td key={j} className="px-4 py-2.5 text-ink-secondary">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {section.callouts && (
        <div className="space-y-2">
          {section.callouts.map((c, i) => (
            <CalloutItem key={i} {...c} />
          ))}
        </div>
      )}

      {section.faq && (
        <div className="space-y-2">
          {section.faq.map((f, i) => (
            <details
              key={i}
              className="group rounded-card border border-white/5 bg-surface-2/30 p-4"
            >
              <summary className="flex cursor-pointer items-center gap-3 text-[13px] font-semibold text-ink-primary">
                <Icon
                  name="chevron-right"
                  size={14}
                  className="text-ink-muted transition group-open:rotate-90"
                />
                {f.q}
              </summary>
              <div className="mt-3 pl-6 text-[12px] text-ink-secondary">{f.a}</div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

function CalloutItem({
  tone,
  icon,
  text,
}: Callout) {
  const cls = {
    info: "border-sig-info/30 bg-sig-info/10 text-sig-info",
    warn: "border-sig-warn/30 bg-sig-warn/10 text-sig-warn",
    buy: "border-sig-buy/30 bg-sig-buy/10 text-sig-buy",
    sell: "border-sig-sell/30 bg-sig-sell/10 text-sig-sell",
  }[tone];
  const defaultIcon: IconName = {
    info: "info" as IconName,
    warn: "alert-triangle" as IconName,
    buy: "circle-check" as IconName,
    sell: "circle-x" as IconName,
  }[tone];
  return (
    <div
      className={`flex items-start gap-2.5 rounded-chip border px-3 py-2.5 text-[12px] ${cls}`}
    >
      <Icon name={icon ?? defaultIcon} size={14} className="mt-0.5 shrink-0" />
      <div className="flex-1 leading-relaxed">{text}</div>
    </div>
  );
}
