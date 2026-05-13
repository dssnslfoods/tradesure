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
        body: "All / Open / Queued / Wins / Losses / No Trade — กดเพื่อกรอง signal ตาม outcome",
      },
      {
        title: "Trade card",
        icon: "chart-candle",
        body: "แต่ละการ์ดแสดง: symbol + price + AI bias + R:R + ระดับ Entry/SL/TP1/TP2 + outcome + PnL",
      },
      {
        title: "Auto-archive",
        icon: "eye-off",
        body: "Card ที่จบแล้ว (WIN/LOSS/SKIP) เก่ากว่า N วัน (default 7) จะถูกซ่อนจาก grid — แต่ data ใน DB และ analytics ยังครบ",
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
    id: "u-outcomes",
    title: "อ่าน Outcome chips",
    icon: "filter",
    intro: "Chip มุมขวาบนของ card บอกสถานะของ signal · มีหลายแบบ",
    table: {
      headers: ["Chip", "ความหมาย", "Telegram?"],
      rows: [
        [
          <span key="pending" className="chip chip-mute !text-[10px]">Pending</span>,
          "Signal ใหม่ รอ backtest cron ตรวจผล",
          "✅ ส่งแล้ว",
        ],
        [
          <span key="open" className="chip chip-info !text-[10px]">Open</span>,
          "Backtest แล้ว แต่ราคายังไม่แตะ TP/SL",
          "✅ ส่งแล้ว",
        ],
        [
          <span key="win1" className="chip chip-buy !text-[10px]">TP1 hit</span>,
          "ราคาแตะ TP1 — ปิดกำไรขั้นแรก",
          "✅ ส่งแล้ว",
        ],
        [
          <span key="win2" className="chip chip-buy !text-[10px]">TP2 hit</span>,
          "ราคาแตะ TP2 — กำไรเต็มไม้",
          "✅ ส่งแล้ว",
        ],
        [
          <span key="loss" className="chip chip-sell !text-[10px]">SL hit</span>,
          "ราคาแตะ SL — ขาดทุน",
          "✅ ส่งแล้ว",
        ],
        [
          <span key="queued" className="chip chip-info !text-[10px]">Queued</span>,
          "AI active schedule กำลังหลับ → รอ admin process",
          "❌ ไม่ส่ง",
        ],
        [
          <span key="lowconf" className="chip chip-warn !text-[10px]">Low conf</span>,
          "AI confidence < 70% (MIN_CONFIDENCE)",
          "❌ ไม่ส่ง",
        ],
        [
          <span key="offhour" className="chip chip-warn !text-[10px]">Off-hour</span>,
          "ชั่วโมง win rate ต่ำ (post-filter)",
          "❌ ไม่ส่ง",
        ],
        [
          <span key="notrade" className="chip chip-warn !text-[10px]">No Trade</span>,
          "AI แนะนำ WAIT (regime ไม่เหมาะ)",
          "✅ ส่ง NO TRADE",
        ],
      ],
    },
    callouts: [
      {
        tone: "info",
        icon: "info",
        text: "Card ที่ outcome เป็น Queued / Low conf / Off-hour / No Trade ไม่นับใน Win rate (รวมเฉพาะ TP1/TP2/SL hit เท่านั้น)",
      },
    ],
  },
  {
    id: "u-bias",
    title: "อ่าน AI bias + Confidence",
    icon: "robot",
    intro: "AI วิเคราะห์ทุก signal และให้คำแนะนำ 3 แบบ พร้อมคะแนนความมั่นใจ",
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
        tone: "info",
        icon: "target",
        text: (
          <>
            <strong>Confidence Bar:</strong> สีเขียวยาว = AI มั่นใจ · สั้น/เหลือง = ระวัง
            · ระบบกรองสัญญาณที่ confidence &lt; 70% ออกอัตโนมัติ
          </>
        ),
      },
      {
        tone: "warn",
        icon: "alert-triangle",
        text: "Signal ที่ AI = WAIT จะส่ง Telegram เป็น 'NO TRADE — ไม่แนะนำให้เข้า' พร้อม banner แดง",
      },
    ],
  },
  {
    id: "u-telegram",
    title: "Telegram alerts ที่จะได้รับ",
    icon: "telegram",
    intro:
      "Active user ทุกคนจะได้รับ Telegram alert พร้อมกัน — มี 5 ประเภทหลัก",
    table: {
      headers: ["Alert type", "เมื่อไหร่ที่ได้รับ", "ความถี่"],
      rows: [
        ["🚨 Signal alert (BUY/SELL)", "TradingView ยิง signal + AI ผ่าน filter ทั้งหมด", "1-3 ครั้ง/วัน"],
        ["⛔ NO TRADE (WAIT bias)", "AI วิเคราะห์แล้วไม่แนะนำให้เข้า", "1-5 ครั้ง/วัน"],
        ["🟡 NO_TRADE heartbeat", "ทุก candle close ที่ Pine ไม่มี setup", "~20-22 ครั้ง/วัน"],
        ["🔥 Top 3 Trending", "เหรียญใหม่เข้า Top 3 hottest", "ทุก 30 นาที"],
        ["🔐 OTP code", "ตอน login", "ตามที่ขอ"],
        ["📢 System Status", "Admin กดเปลี่ยน config + broadcast", "เป็นครั้งคราว"],
      ],
    },
    callouts: [
      {
        tone: "info",
        icon: "info",
        text: (
          <>
            <strong>NO_TRADE heartbeat</strong> ส่งทุกชั่วโมง — เป็น "ระบบยังทำงานปกติ" + บอกเหตุผลที่ไม่เทรด เช่น "ไม่มี EMA cross" / "ADX ต่ำ" / "ชั่วโมงที่ block"
          </>
        ),
      },
      {
        tone: "warn",
        icon: "ban",
        text: "ถ้าไม่อยากรับ alert ชั่วคราว → admin สามารถ disable account ได้ (account ที่ disabled จะไม่รับ alert + login ไม่ได้)",
      },
    ],
  },
  {
    id: "u-message-format",
    title: "เนื้อหาใน Telegram message",
    icon: "send",
    intro:
      "BUY/SELL signal แต่ละครั้งจะมีข้อมูลครบ — รวมทั้ง Market Context (Macro) ที่ AI ใช้ประกอบการตัดสินใจ",
    steps: [
      {
        title: "Trade plan",
        icon: "target",
        body: "Symbol + Timeframe + Signal direction + ราคาเข้า + Entry zone + SL + TP1 + TP2 (พร้อม %)",
      },
      {
        title: "AI verdict",
        icon: "robot",
        body: "Bias (LONG/SHORT/WAIT) + Confidence % + Risk level + R:R ratio",
      },
      {
        title: "AI reasoning",
        icon: "chart-line",
        body: "สรุปสั้นๆ ภาษาไทยว่าทำไม AI เห็นด้วย/ไม่เห็นด้วย + checklist ที่ผ่าน",
      },
      {
        title: "Second opinion (ถ้าเปิด Compare/Vote mode)",
        icon: "device-analytics",
        body: "AI ตัวที่ 2 (เช่น Gemini) วิเคราะห์ด้วย — ✅ agree หรือ ❌ disagree พร้อม confidence",
      },
      {
        title: "Market Context",
        icon: "trending-up",
        body: "Fear & Greed Index + BTC Dominance + Funding Rate (8h) — macro overview ตอนสัญญาณเกิด",
      },
    ],
    callouts: [
      {
        tone: "info",
        icon: "info",
        text: "Funding > +0.05% = longs crowded (ระวัง long squeeze) · Funding < -0.05% = shorts crowded · Fear & Greed > 75 = extreme greed (ระวัง top)",
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
        title: "Equity curve",
        icon: "chart-line",
        body: "Cumulative P&L over time — เห็นว่าระบบกำลังขึ้น/ลง / sideways",
      },
      {
        title: "Outcome donut",
        icon: "chart-line",
        body: "สัดส่วน TP1/TP2/SL/No Trade — donut chart",
      },
      {
        title: "Hour of day heatmap",
        icon: "clock",
        body: "Win rate ในแต่ละชั่วโมง (BKK) — เห็นว่าชั่วโมงไหนเทรดดี/แย่ — ใช้ตัดสินใจ blocked hours",
      },
      {
        title: "Confidence vs Win rate",
        icon: "target",
        body: "Histogram — AI confidence buckets vs winrate · ถ้า correlation positive = AI calibrated ดี",
      },
    ],
    callouts: [
      {
        tone: "info",
        icon: "info",
        text: "ข้อมูลนับเฉพาะ signal ที่ outcome = WIN_TP1 / WIN_TP2 / LOSS_SL · ไม่รวม PENDING / OPEN / NO TRADE / QUEUED / SKIP_*",
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
      "Admin มีสิทธิ์ทำทุกอย่างที่ user ทำได้ + จัดการระบบ + AI config + ปรับ filter — ระบบป้องกัน self-lockout (admin คนสุดท้าย demote ตัวเองไม่ได้)",
    table: {
      headers: ["Feature", "User", "Admin"],
      rows: [
        ["ดู signals + analytics + trending", "✅", "✅"],
        ["Watchlist (ของตัวเอง)", "✅", "✅"],
        ["รับ Telegram alerts", "✅", "✅"],
        ["Edit SL/TP per signal", "❌", "✅"],
        ["Delete signal (เดี่ยว/รวม)", "❌", "✅"],
        ["Run backtest manually", "❌", "✅"],
        ["Pause/Resume schedule", "❌", "✅"],
        ["AI model selection", "❌", "✅"],
        ["AI API key management", "❌", "✅"],
        ["AI active schedule (multi-window + days)", "❌", "✅"],
        ["Process queued signals", "❌", "✅"],
        ["Card retention setting", "❌", "✅"],
        ["View Configuration (system snapshot)", "❌", "✅"],
        ["Broadcast Status (system update)", "❌", "✅"],
        ["Manage users (CRUD)", "❌", "✅"],
        ["Setup Telegram webhook", "❌", "✅"],
      ],
    },
  },
  {
    id: "a-schedule-hub",
    title: "Schedule hub — ศูนย์ควบคุมระบบ",
    icon: "settings",
    intro:
      "ที่หน้า /dashboard/schedule — admin control center รวมทุก setting ของระบบ AI + Filter + Schedule + Broadcast",
    steps: [
      {
        title: "View Configuration",
        icon: "eye",
        body: "ปุ่มมุมขวาบน → modal แสดง config ทั้งระบบใน 6 sections: System / AI / Keys / Schedule / Filters / Connections + ปุ่ม Copy text ส่ง support",
      },
      {
        title: "Enable / Pause",
        icon: "pause",
        body: "Toggle ระบบ backtest scheduler — ใส่ pause reason ได้",
      },
      {
        title: "Card retention",
        icon: "eye-off",
        body: "Auto-archive card ที่จบแล้วเก่ากว่า N วัน (default 7) — ข้อมูล DB ยังเก็บครบ analytics ใช้ data เต็ม",
      },
      {
        title: "Run backtest now",
        icon: "lightning",
        body: "Trigger manual — override pause flag",
      },
    ],
    callouts: [
      {
        tone: "info",
        icon: "info",
        text: "View Configuration ปลอดภัย — API keys แสดงแค่ mask (sk-Ab…cD12) ไม่มี plaintext ที่ client",
      },
    ],
  },
  {
    id: "a-ai-config",
    title: "AI Configuration (Multi-provider)",
    icon: "robot",
    intro:
      "ระบบรองรับ OpenAI (GPT) + Google Gemini · admin เลือก model + mode + จัดการ keys ได้จาก dashboard ไม่ต้อง redeploy",
    steps: [
      {
        title: "AI Model picker",
        icon: "robot",
        body: "เลือก primary model จาก dropdown (จัดกลุ่ม OpenAI/Gemini) · กด Save → มีผลทันทีกับ signal ถัดไป",
      },
      {
        title: "Dual-model comparison",
        icon: "device-analytics",
        body: "3 modes: Single (1 AI) · Compare (รัน 2 AI พร้อมกัน แสดงทั้งคู่) · Vote (ต้อง agree ถึงส่ง Telegram)",
      },
      {
        title: "API key management",
        icon: "key",
        body: "ใส่ OpenAI + Gemini keys ตรงๆ ใน dashboard · เก็บใน DB (service-role only) · override env vars · แสดงเฉพาะ mask",
      },
    ],
    table: {
      headers: ["Model", "Provider", "ราคา/M tokens (in/out)", "ลักษณะ"],
      rows: [
        ["gpt-4o-mini ⭐", "OpenAI", "$0.15 / $0.60", "default · เร็ว · ราคาถูก"],
        ["gpt-4o", "OpenAI", "$2.50 / $10", "ฉลาดกว่า · vision"],
        ["gpt-4.1-mini", "OpenAI", "$0.40 / $1.60", "ใหม่ · ราคาถูก"],
        ["gemini-2.5-flash ⭐", "Google", "FREE 1500 req/วัน", "ฟรี! · เร็ว"],
        ["gemini-2.5-pro", "Google", "$1.25 / $5", "ฉลาดสุดของ Google"],
      ],
    },
    callouts: [
      {
        tone: "buy",
        icon: "info",
        text: (
          <>
            <strong>Best value setup:</strong> Mode Compare · Primary GPT-4o mini · Secondary
            Gemini 2.5 Flash (FREE) — cost ~$0.60/เดือน ได้ second opinion ฟรีๆ
          </>
        ),
      },
      {
        tone: "warn",
        icon: "alert-triangle",
        text: "Vote mode strict กว่า — ถ้า 2 model disagree → outcome = SKIP_WAIT (ไม่ส่ง Telegram)",
      },
    ],
  },
  {
    id: "a-ai-schedule",
    title: "AI Active Schedule",
    icon: "clock",
    intro:
      "Admin กำหนดช่วงเวลา + วัน ที่ AI จะวิเคราะห์ — นอกช่วงนี้ webhook ถูกเก็บเป็น Queue รอ admin trigger ภายหลัง · ประหยัด API cost",
    steps: [
      {
        title: "Active days picker",
        icon: "calendar",
        body: "7 ปุ่ม อา-จ-อ-พ-พฤ-ศ-ส · click toggle on/off · Save days",
      },
      {
        title: "Hour windows (multi-window)",
        icon: "clock",
        body: "เพิ่มได้สูงสุด 8 windows ต่อวัน (BKK time) · เช่น 06-11 + 14-22 · ว่างเปล่า = ทำงาน 24h · start > end = ข้ามคืน",
      },
      {
        title: "Process queued signals",
        icon: "lightning",
        body: "Webhook ที่เข้านอกช่วง → outcome=QUEUED · กดปุ่ม Process queue (N) → batch AI วิเคราะห์ทั้งหมด · ส่ง Telegram ที่ผ่าน filter",
      },
    ],
    callouts: [
      {
        tone: "info",
        icon: "info",
        text: "Active now / Idle now chip บน schedule page โชว์สถานะปัจจุบัน · banner สีเหลืองโผล่ที่ /dashboard เมื่อ AI off-hours",
      },
      {
        tone: "warn",
        icon: "alert-triangle",
        text: "NO_TRADE heartbeat ไม่ถูก gate ของ schedule — ยังส่งตามปกติ (ปิดได้ด้วย env NOTRADE_TELEGRAM=0)",
      },
    ],
  },
  {
    id: "a-pine-strategy",
    title: "Pine Scripts — Indicator + Strategy",
    icon: "chart-candle",
    intro:
      "ระบบมี Pine Script 2 ตัว: Indicator v2 (ส่ง webhook live) + Strategy v1.3 (backtest บน TradingView)",
    steps: [
      {
        title: "Indicator v2 (Live)",
        icon: "send",
        body: "ไฟล์ pine/btc_futures_signal_v2.pine · indicator() declaration · ต้องตั้ง alert webhook · ส่ง JSON payload เข้า /api/webhook/tradingview",
      },
      {
        title: "Strategy v1.3 (Backtest)",
        icon: "device-analytics",
        body: "ไฟล์ pine/btc_futures_strategy_v1.pine · strategy() declaration · ใช้ Strategy Tester ดู P&L · ❌ ไม่ต้องตั้ง alert",
      },
      {
        title: "Settings v1.3 Day Trader",
        icon: "robot",
        body: "Fast EMA 9 · Slow EMA 21 · Trend EMA 50 · ADX 15 · SL 1.2 ATR · TP1 0.8R · TP2 1.6R · Cooldown 1 · Time filter OFF",
      },
      {
        title: "Sync settings ระหว่าง 2 Pine",
        icon: "refresh",
        body: "หลัง optimize Strategy → port inputs ไปที่ Indicator v2 settings (ไม่ต้องลบ alert) · TradingView ใช้ inputs ปัจจุบันเสมอ",
      },
    ],
    callouts: [
      {
        tone: "buy",
        icon: "circle-check",
        text: (
          <>
            <strong>Strategy v1.3 backtest ผลล่าสุด:</strong> 173 trades · win rate 58.96% · PF 0.819
            · เพิ่ม Daily filter + Short only → PF 1.31 (profitable)
          </>
        ),
      },
      {
        tone: "warn",
        icon: "alert-triangle",
        text: "ถ้าทั้งวันไม่มี trade → เช็ค ADX min, Volume mult, ATR% min ใน Indicator v2 settings — ถ้าค่าสูงเกินจะ filter ทุก signal ออก",
      },
    ],
  },
  {
    id: "a-tradingview",
    title: "TradingView Alert Setup",
    icon: "chart-line",
    intro:
      "ตั้งครั้งเดียว · alert ใช้โค้ด Pine ตอนสร้าง — ถ้าแก้โค้ดต้องสร้าง alert ใหม่",
    steps: [
      {
        title: "Pine Editor → Save script",
        icon: "edit",
        body: "Paste โค้ดจาก pine/btc_futures_signal_v2.pine · Save · Add to chart",
      },
      {
        title: "Create Alert",
        icon: "bell",
        body: "Right-click chart → Add alert · Condition: 'BTC Futures BUY/SELL Webhook Alert v2' · Sub: 'Any alert() function call' (สำคัญ!)",
      },
      {
        title: "Webhook URL",
        icon: "send",
        body: "https://tradesure.d2infinite.com/api/webhook/tradingview · Message field: เว้นว่าง (Pine กำหนด JSON เอง)",
      },
      {
        title: "Plan requirement",
        icon: "diamond",
        body: "Free / Essential plan ใช้ webhook ไม่ได้ — ต้อง Pro+ ขึ้นไป",
      },
    ],
    callouts: [
      {
        tone: "warn",
        icon: "alert-triangle",
        text: "ถ้าเปลี่ยน Inputs → alert ใช้ค่าใหม่ทันที (ไม่ต้องสร้างใหม่) · ถ้าแก้ Pine code → ต้องลบ alert + สร้างใหม่",
      },
      {
        tone: "info",
        icon: "info",
        text: "Webhook ตอบ TradingView ภายใน <500ms (fire-and-forget) — AI วิเคราะห์ + Telegram ทำใน background",
      },
    ],
  },
  {
    id: "a-filters",
    title: "Filters & Environment Variables",
    icon: "filter",
    intro:
      "3 ชั้น filter ที่กรองสัญญาณคุณภาพต่ำ — ตั้งผ่าน env vars ใน Firebase App Hosting · view ผ่าน View Configuration modal",
    table: {
      headers: ["Variable", "Default", "ความหมาย"],
      rows: [
        ["MIN_CONFIDENCE", "70", "AI confidence ต่ำกว่านี้ → SKIP_LOW_CONF (ไม่ส่ง Telegram)"],
        ["BLOCKED_HOURS", "13,14,16,17,20", "ชั่วโมง BKK ที่ post-filter block (defense-in-depth — Pine ก็ block ด้วย)"],
        ["NOTRADE_TELEGRAM", "1", "ส่ง NO_TRADE heartbeat ทุกชั่วโมง · ตั้ง 0 = ปิด"],
        ["TRADINGVIEW_WEBHOOK_SECRET", "—", "Pine secret ต้องตรง — มิฉะนั้น 401"],
        ["TELEGRAM_BOT_TOKEN", "—", "Bot token จาก @BotFather"],
        ["MIN_CONFIDENCE override", "via DB", "Future: per-symbol confidence"],
      ],
    },
    callouts: [
      {
        tone: "info",
        icon: "info",
        text: "เปลี่ยน env var → ต้องรอ Firebase rollback (~2 นาที) แล้วทำงานทันที — ไม่ต้อง redeploy",
      },
      {
        tone: "warn",
        icon: "ban",
        text: "BLOCKED_HOURS ใช้รูปแบบ comma-separated 0-23 BKK time — เช่น '13,14,20' = block 3 ชั่วโมง",
      },
    ],
  },
  {
    id: "a-broadcast",
    title: "Broadcast Status (เคย Test broadcast)",
    icon: "send",
    intro:
      "ปุ่ม Broadcast status ที่ /dashboard/users — ส่ง System Status snapshot ไปทุก user · ทำหน้าที่ test delivery + system announcement",
    steps: [
      {
        title: "เมื่อไหร่ควรกด",
        icon: "info",
        body: "หลังเปลี่ยน config สำคัญ (AI model, schedule, key) · weekly update · ทดสอบว่า Telegram broadcast ยังทำงาน",
      },
      {
        title: "User จะเห็นอะไร",
        icon: "telegram",
        body: "System status + AI engine info + API keys status (no plaintext) + AI schedule + Filters + Connection counts",
      },
      {
        title: "ส่งสำเร็จเช็คได้",
        icon: "circle-check",
        body: "Toast ขึ้น 'ส่ง Configuration snapshot สำเร็จ N chat' · ถ้า failed มี error log",
      },
    ],
    callouts: [
      {
        tone: "buy",
        icon: "shield-check",
        text: "ปลอดภัย — API keys โชว์แค่ source label (DB/ENV/Not set) ไม่มี plaintext หรือ mask",
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
        title: "Delete เดี่ยว / Bulk",
        icon: "trash",
        body: "Single: กดถังขยะที่ card · Bulk: ติ๊ก checkbox มุมขวาบนหลาย cards → 'Delete selected (N)'",
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
    id: "a-users",
    title: "Users & Telegram contacts",
    icon: "users",
    intro: "ที่หน้า /dashboard/users — สร้าง user ใหม่จาก contact ที่ส่ง /start หา bot",
    steps: [
      {
        title: "ผู้ใช้ใหม่ส่ง /start หา bot",
        icon: "telegram",
        body: "Bot ตอบกลับพร้อม Chat ID + แจ้ง 'รอ admin อนุมัติ' — contact ปรากฏในตาราง Telegram contacts ทันที",
      },
      {
        title: "Create user จาก contact",
        icon: "user-plus",
        body: "ที่ row contact → '+ Create user' → ตั้ง username + display name + ☑ admin (ถ้าต้องการ) → Create",
      },
      {
        title: "Toggle active/admin",
        icon: "settings",
        body: "ที่ตาราง Auth users → คลิก chip 'active' / 'admin' เพื่อ toggle",
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
    ],
  },
  {
    id: "a-architecture",
    title: "System Architecture",
    icon: "device-analytics",
    intro: "ภาพรวม system stack ของ Tradesure",
    table: {
      headers: ["Component", "Tech", "Provider"],
      rows: [
        ["Frontend", "Next.js 14 App Router + TS + Tailwind", "Firebase App Hosting"],
        ["Database", "PostgreSQL", "Supabase"],
        ["AI (primary)", "GPT-4o mini / GPT-4o / GPT-4.1", "OpenAI"],
        ["AI (secondary)", "Gemini 2.5 Flash / Pro", "Google AI Studio"],
        ["Backtest data", "Public klines API (no key)", "Binance"],
        ["Market context", "Fear&Greed + BTC.D + Funding", "alternative.me + CoinGecko + Binance"],
        ["Auth", "OTP via Telegram + HMAC cookie", "Self-hosted"],
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
        q: "ทั้งวันไม่มี BUY/SELL signal เลย (มีแค่ NO_TRADE)",
        a: (
          <>
            <strong>สาเหตุที่พบบ่อยสุด:</strong>
            <ul className="ml-4 mt-2 list-disc space-y-1">
              <li>Indicator v2 settings เข้มเกิน — เช็ค ADX min (ควร 15), Volume mult (ควร 0.9), ATR% min (ควร 0.15)</li>
              <li>Enable LONG ปิดอยู่ — เปิด ☑ Enable LONG (BUY) alerts</li>
              <li>AI active schedule ปิดอยู่ — ดู banner เหลือง /dashboard</li>
              <li>BTC market ranging (no EMA cross) — เป็นปกติ ถ้าตลาดไม่มี trend</li>
            </ul>
            <strong className="mt-2 block">วิธี diagnose:</strong> กด View Configuration ที่
            /dashboard/schedule → ดู snapshot · หรืออ่าน reason ใน NO_TRADE Telegram messages
          </>
        ),
      },
      {
        q: "AI bias = WAIT บ่อยเกินไป",
        a: (
          <>
            ดู /dashboard/analytics → Confidence vs Win rate — ถ้า confidence ของ WAIT สูง = AI ระมัดระวังถูก ·
            ถ้า correlation ลบ = ปรับ AI prompt ใน lib/ai/analyzeCryptoSignal.ts
          </>
        ),
      },
      {
        q: "Signals มี Queued เยอะ",
        a: (
          <>
            AI active schedule ตั้งช่วงแคบเกิน → signal เข้านอกช่วง · ไปที่ /dashboard/schedule →
            กด <strong>Process queue (N)</strong> เพื่อ batch วิเคราะห์ทั้งหมด ·
            หรือขยาย active windows ให้ครอบคลุมเวลาที่ Pine fire signal
          </>
        ),
      },
      {
        q: "ขาดทุนเรื่อยๆ — strategy เป็นยังไง?",
        a: (
          <>
            1) ดู /dashboard/analytics → Rolling win rate (ลงเรื่อย = regime เปลี่ยน)
            <br />
            2) ดู Confidence vs Win rate — ถ้ากระจุก = AI ไม่ calibrated · prompt ใน analyzeCryptoSignal.ts
            <br />
            3) ลองเปิด Compare/Vote mode → second opinion ช่วย filter
            <br />
            4) Backtest Pine Strategy v1.3 หา parameter ที่ดีกว่า
          </>
        ),
      },
      {
        q: "Margin call หลายครั้งใน backtest",
        a: (
          <>
            Strategy Tester → Settings → <strong>Properties</strong> tab →
            Default order size → เลือก <strong>"% of equity"</strong> (ไม่ใช่ "Quantity") +
            ตั้งเป็น 20-25 → OK
          </>
        ),
      },
      {
        q: "Pine alert ไม่ trigger หลังแก้โค้ด",
        a: (
          <>
            TradingView cache โค้ดตอน create alert · ลบ alert เก่าที่ /dashboard/users → Alerts panel ·
            สร้าง alert ใหม่ตามขั้นตอน TradingView setup
          </>
        ),
      },
      {
        q: "Bot ไม่ตอบเมื่อส่ง /start",
        a: (
          <>
            เช็ค Telegram webhook status ที่ /dashboard/users — ถ้า status ≠ Active
            ให้กด 'Setup webhook' ใหม่
          </>
        ),
      },
      {
        q: "User ไม่ได้รับ Telegram alert",
        a: (
          <>
            เช็ค: 1) account active อยู่ไหม 2) chat_id ใน auth_users ตรงกับ chat ที่ login
            3) ลอง <strong>Broadcast status</strong> ที่ /dashboard/users → ดู recipient count
          </>
        ),
      },
      {
        q: "TradingView ขึ้น 'request took too long and timed out'",
        a: (
          <>
            ✅ <strong>แก้แล้ว</strong> — webhook ตอบภายใน &lt;500ms ด้วย fire-and-forget pattern ·
            AI/Telegram ทำใน background
          </>
        ),
      },
      {
        q: "Backtest ไม่อัปเดต outcome",
        a: (
          <>
            1) เช็ค schedule status — ถ้า Paused → Resume
            <br />
            2) signal time อยู่ในอดีตหรือยัง (ต้องมี klines หลัง signal time)
            <br />
            3) ดู Recent runs ที่ /dashboard/schedule ว่ามี error ไหม
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
