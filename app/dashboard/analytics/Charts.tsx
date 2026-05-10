"use client";

import type {
  AllAnalytics,
  ConfidenceBucket,
  EquityPoint,
  DailyPoint,
  HourlyStat,
  RollingPoint,
  SymbolStat,
} from "@/lib/analytics/computeStats";

// ============================================================
// Equity curve — cumulative PnL % over time (filled area + line)
// ============================================================
export function EquityCurve({ points }: { points: EquityPoint[] }) {
  if (points.length < 2) return <EmptyChart label="ยังไม่มีข้อมูลพอจะคำนวณ equity" />;

  const W = 600;
  const H = 220;
  const PAD_L = 40;
  const PAD_R = 12;
  const PAD_T = 12;
  const PAD_B = 24;

  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const xs = points.map((p) => p.t);
  const ys = points.map((p) => p.cumPnl);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMinRaw = Math.min(0, ...ys);
  const yMaxRaw = Math.max(0, ...ys);
  const yPad = (yMaxRaw - yMinRaw) * 0.1 || 1;
  const yMin = yMinRaw - yPad;
  const yMax = yMaxRaw + yPad;

  const xScale = (t: number) => PAD_L + ((t - xMin) / (xMax - xMin || 1)) * innerW;
  const yScale = (v: number) => PAD_T + (1 - (v - yMin) / (yMax - yMin)) * innerH;
  const zeroY = yScale(0);

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.t).toFixed(1)} ${yScale(p.cumPnl).toFixed(1)}`)
    .join(" ");

  const fillPath =
    `M ${xScale(points[0].t).toFixed(1)} ${zeroY.toFixed(1)} ` +
    points.map((p) => `L ${xScale(p.t).toFixed(1)} ${yScale(p.cumPnl).toFixed(1)}`).join(" ") +
    ` L ${xScale(points[points.length - 1].t).toFixed(1)} ${zeroY.toFixed(1)} Z`;

  const finalPnl = points[points.length - 1].cumPnl;
  const positive = finalPnl >= 0;
  const stroke = positive ? "#34d399" : "#f87171";
  const fill = positive ? "rgba(52,211,153,0.2)" : "rgba(248,113,113,0.2)";

  // Y-axis ticks (5 marks)
  const yTicks = 5;
  const tickValues = Array.from({ length: yTicks }, (_, i) =>
    yMin + ((yMax - yMin) * i) / (yTicks - 1)
  );

  return (
    <ChartFrame title="📈 Equity curve" subtitle={`Total PnL: ${finalPnl.toFixed(2)}%`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {/* gridlines */}
        {tickValues.map((v) => (
          <g key={v}>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={yScale(v)}
              y2={yScale(v)}
              stroke="rgba(148,163,184,0.1)"
              strokeWidth={1}
            />
            <text
              x={PAD_L - 5}
              y={yScale(v) + 3}
              textAnchor="end"
              fontSize="9"
              fill="#64748b"
            >
              {v.toFixed(1)}%
            </text>
          </g>
        ))}
        {/* zero line */}
        <line
          x1={PAD_L}
          x2={W - PAD_R}
          y1={zeroY}
          y2={zeroY}
          stroke="rgba(148,163,184,0.4)"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
        {/* fill area */}
        <path d={fillPath} fill={fill} />
        {/* line */}
        <path d={linePath} stroke={stroke} strokeWidth={2} fill="none" strokeLinejoin="round" />
        {/* x-axis labels */}
        <text x={PAD_L} y={H - 5} fontSize="9" fill="#64748b">
          {new Date(xMin).toLocaleDateString("en-GB")}
        </text>
        <text x={W - PAD_R} y={H - 5} textAnchor="end" fontSize="9" fill="#64748b">
          {new Date(xMax).toLocaleDateString("en-GB")}
        </text>
      </svg>
    </ChartFrame>
  );
}

// ============================================================
// Outcome donut — proportions of WIN/LOSS/OPEN/etc
// ============================================================
export function OutcomeDonut({ outcomes }: { outcomes: AllAnalytics["outcomes"] }) {
  const items = [
    { key: "WIN_TP2", label: "✅✅ TP2", value: outcomes.WIN_TP2, color: "#10b981" },
    { key: "WIN_TP1", label: "✅ TP1", value: outcomes.WIN_TP1, color: "#34d399" },
    { key: "LOSS_SL", label: "❌ SL", value: outcomes.LOSS_SL, color: "#f87171" },
    { key: "OPEN", label: "⏳ Open", value: outcomes.OPEN, color: "#38bdf8" },
    { key: "PENDING", label: "🕒 Pending", value: outcomes.PENDING, color: "#94a3b8" },
    { key: "SKIP_WAIT", label: "⛔ No Trade", value: outcomes.SKIP_WAIT, color: "#fbbf24" },
    { key: "NO_DATA_OR_ERROR", label: "— No data", value: outcomes.NO_DATA_OR_ERROR, color: "#475569" },
  ].filter((x) => x.value > 0);

  const total = items.reduce((a, x) => a + x.value, 0);
  if (total === 0) return <EmptyChart label="ยังไม่มี outcome ใดๆ" />;

  const W = 220;
  const H = 220;
  const cx = W / 2;
  const cy = H / 2;
  const rOuter = 90;
  const rInner = 55;

  let acc = 0;
  const arcs = items.map((it) => {
    const start = (acc / total) * Math.PI * 2;
    acc += it.value;
    const end = (acc / total) * Math.PI * 2;
    const large = end - start > Math.PI ? 1 : 0;

    const x0 = cx + rOuter * Math.sin(start);
    const y0 = cy - rOuter * Math.cos(start);
    const x1 = cx + rOuter * Math.sin(end);
    const y1 = cy - rOuter * Math.cos(end);
    const xi0 = cx + rInner * Math.sin(end);
    const yi0 = cy - rInner * Math.cos(end);
    const xi1 = cx + rInner * Math.sin(start);
    const yi1 = cy - rInner * Math.cos(start);

    const d = [
      `M ${x0.toFixed(2)} ${y0.toFixed(2)}`,
      `A ${rOuter} ${rOuter} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`,
      `L ${xi0.toFixed(2)} ${yi0.toFixed(2)}`,
      `A ${rInner} ${rInner} 0 ${large} 0 ${xi1.toFixed(2)} ${yi1.toFixed(2)}`,
      "Z",
    ].join(" ");

    return { d, color: it.color, label: it.label, value: it.value };
  });

  return (
    <ChartFrame title="🎯 Outcome breakdown" subtitle={`${total} signals`}>
      <div className="flex flex-wrap items-center gap-6">
        <svg viewBox={`0 0 ${W} ${H}`} width={180} height={180} className="shrink-0">
          {arcs.map((a, i) => (
            <path key={i} d={a.d} fill={a.color} stroke="#0f172a" strokeWidth={1} />
          ))}
          <text
            x={cx}
            y={cy - 5}
            textAnchor="middle"
            fontSize="22"
            fontWeight="bold"
            fill="#e2e8f0"
          >
            {total}
          </text>
          <text x={cx} y={cy + 14} textAnchor="middle" fontSize="10" fill="#64748b">
            signals
          </text>
        </svg>
        <ul className="flex-1 space-y-1.5 text-xs">
          {arcs.map((a, i) => {
            const pct = ((a.value / total) * 100).toFixed(1);
            return (
              <li key={i} className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded"
                  style={{ background: a.color }}
                />
                <span className="text-slate-300">{a.label}</span>
                <span className="ml-auto tabular-nums text-slate-400">
                  {a.value} ({pct}%)
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </ChartFrame>
  );
}

// ============================================================
// Daily PnL bars — per day total PnL, win = green, loss = red
// ============================================================
export function DailyPnlBars({ data }: { data: DailyPoint[] }) {
  if (data.length === 0) return <EmptyChart label="ยังไม่มี outcome รายวัน" />;
  const W = 600;
  const H = 200;
  const PAD_L = 35;
  const PAD_R = 12;
  const PAD_T = 12;
  const PAD_B = 32;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const ys = data.map((d) => d.pnl);
  const yMin = Math.min(0, ...ys);
  const yMax = Math.max(0, ...ys);
  const range = yMax - yMin || 1;

  const yScale = (v: number) => PAD_T + (1 - (v - yMin) / range) * innerH;
  const zeroY = yScale(0);
  const barW = innerW / data.length - 2;

  return (
    <ChartFrame title="📅 Daily PnL" subtitle={`${data.length} day(s)`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {/* zero line */}
        <line
          x1={PAD_L}
          x2={W - PAD_R}
          y1={zeroY}
          y2={zeroY}
          stroke="rgba(148,163,184,0.4)"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
        {/* y labels */}
        <text x={PAD_L - 5} y={PAD_T + 8} textAnchor="end" fontSize="9" fill="#64748b">
          {yMax.toFixed(1)}%
        </text>
        <text x={PAD_L - 5} y={H - PAD_B - 2} textAnchor="end" fontSize="9" fill="#64748b">
          {yMin.toFixed(1)}%
        </text>
        {/* bars */}
        {data.map((d, i) => {
          const x = PAD_L + i * (innerW / data.length) + 1;
          const y = d.pnl >= 0 ? yScale(d.pnl) : zeroY;
          const h = Math.abs(yScale(d.pnl) - zeroY);
          const color = d.pnl >= 0 ? "#34d399" : "#f87171";
          return (
            <g key={d.date}>
              <rect x={x} y={y} width={barW} height={h} fill={color} opacity="0.85">
                <title>
                  {d.date}: {d.pnl >= 0 ? "+" : ""}
                  {d.pnl}% · {d.wins}W/{d.losses}L
                </title>
              </rect>
            </g>
          );
        })}
        {/* x axis dates: first/last */}
        <text x={PAD_L} y={H - 10} fontSize="9" fill="#64748b">
          {data[0].date}
        </text>
        <text x={W - PAD_R} y={H - 10} textAnchor="end" fontSize="9" fill="#64748b">
          {data[data.length - 1].date}
        </text>
      </svg>
    </ChartFrame>
  );
}

// ============================================================
// Top symbols — horizontal bar of total PnL by symbol
// ============================================================
export function TopSymbols({ data }: { data: SymbolStat[] }) {
  const top = data.slice(0, 10);
  if (top.length === 0) return <EmptyChart label="ยังไม่มี trade ที่จบแล้วสำหรับ symbol ใดๆ" />;

  const maxAbs = Math.max(...top.map((s) => Math.abs(s.totalPnl))) || 1;

  return (
    <ChartFrame title="🏆 Top symbols (PnL)" subtitle={`${data.length} symbol(s)`}>
      <ul className="space-y-2">
        {top.map((s) => {
          const pct = (Math.abs(s.totalPnl) / maxAbs) * 100;
          const positive = s.totalPnl >= 0;
          return (
            <li key={s.symbol} className="flex items-center gap-3 text-xs">
              <span className="w-20 shrink-0 font-semibold text-slate-200">{s.symbol}</span>
              <div className="relative h-5 flex-1 rounded bg-black/30">
                <div
                  className={`absolute h-full rounded ${
                    positive ? "bg-emerald-500/40" : "bg-rose-500/40"
                  }`}
                  style={{ width: `${pct}%` }}
                />
                <span
                  className={`absolute inset-0 flex items-center px-2 font-semibold tabular-nums ${
                    positive ? "text-emerald-300" : "text-rose-300"
                  }`}
                >
                  {positive ? "+" : ""}
                  {s.totalPnl}%
                </span>
              </div>
              <span className="w-20 shrink-0 text-right text-slate-500">
                {s.wins}W / {s.losses}L
                {s.winRate !== null && (
                  <span className="ml-1 text-slate-600">({s.winRate}%)</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </ChartFrame>
  );
}

// ============================================================
// Rolling win rate (window 10)
// ============================================================
export function RollingWinRate({ points }: { points: RollingPoint[] }) {
  if (points.length < 2) return <EmptyChart label="ต้องมีอย่างน้อย 2 trades ที่จบแล้ว" />;
  const W = 600;
  const H = 180;
  const PAD_L = 35;
  const PAD_R = 12;
  const PAD_T = 12;
  const PAD_B = 24;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const xs = points.map((p) => p.t);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const xScale = (t: number) => PAD_L + ((t - xMin) / (xMax - xMin || 1)) * innerW;
  const yScale = (v: number) => PAD_T + (1 - v / 100) * innerH;

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.t).toFixed(1)} ${yScale(p.winRate).toFixed(1)}`)
    .join(" ");

  return (
    <ChartFrame title="📊 Rolling win rate (window 10)" subtitle="หลังเฉลี่ย 10 trades ล่าสุด">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {/* 50% reference line */}
        <line
          x1={PAD_L}
          x2={W - PAD_R}
          y1={yScale(50)}
          y2={yScale(50)}
          stroke="rgba(148,163,184,0.4)"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
        <text x={PAD_L - 5} y={yScale(0) + 3} textAnchor="end" fontSize="9" fill="#64748b">
          0%
        </text>
        <text x={PAD_L - 5} y={yScale(50) + 3} textAnchor="end" fontSize="9" fill="#64748b">
          50%
        </text>
        <text x={PAD_L - 5} y={yScale(100) + 3} textAnchor="end" fontSize="9" fill="#64748b">
          100%
        </text>
        <path d={path} stroke="#38bdf8" strokeWidth={2} fill="none" strokeLinejoin="round" />
        <text x={PAD_L} y={H - 5} fontSize="9" fill="#64748b">
          {new Date(xMin).toLocaleDateString("en-GB")}
        </text>
        <text x={W - PAD_R} y={H - 5} textAnchor="end" fontSize="9" fill="#64748b">
          {new Date(xMax).toLocaleDateString("en-GB")}
        </text>
      </svg>
    </ChartFrame>
  );
}

// ============================================================
// Hour of day heatmap
// ============================================================
export function HourOfDayHeatmap({ data }: { data: HourlyStat[] }) {
  const maxCount = Math.max(...data.map((h) => h.count)) || 1;
  const totalSignals = data.reduce((a, b) => a + b.count, 0);
  if (totalSignals === 0) return <EmptyChart label="ยังไม่มี trade ที่จบ" />;

  return (
    <ChartFrame title="🕒 Performance by hour of day" subtitle="(เวลาท้องถิ่น browser)">
      <div className="grid grid-cols-12 gap-1 text-[9px]">
        {data.map((h) => {
          const intensity = h.count / maxCount;
          // background by win rate
          const wr = h.winRate;
          const bg =
            wr === null
              ? "rgba(71,85,105,0.4)"
              : wr >= 60
              ? `rgba(52,211,153,${0.3 + intensity * 0.5})`
              : wr >= 40
              ? `rgba(251,191,36,${0.3 + intensity * 0.5})`
              : `rgba(248,113,113,${0.3 + intensity * 0.5})`;
          return (
            <div
              key={h.hour}
              className="flex aspect-square flex-col items-center justify-center rounded border border-slate-700/40"
              style={{ background: bg }}
              title={
                h.count === 0
                  ? `${h.hour}:00 — ไม่มีข้อมูล`
                  : `${h.hour}:00 — ${h.count} trades, ${h.wins}W/${h.losses}L, PnL ${h.totalPnl}%`
              }
            >
              <span className="text-[10px] font-bold text-slate-100">{h.hour}</span>
              {h.count > 0 && <span className="text-slate-300">{h.count}</span>}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-slate-400">
        <span>Win rate:</span>
        <span className="rounded bg-emerald-500/40 px-1.5 py-0.5 text-emerald-200">≥ 60%</span>
        <span className="rounded bg-amber-500/40 px-1.5 py-0.5 text-amber-200">40-60%</span>
        <span className="rounded bg-rose-500/40 px-1.5 py-0.5 text-rose-200">&lt; 40%</span>
        <span className="ml-auto">Opacity = ความถี่ของ trade ในชั่วโมงนั้น</span>
      </div>
    </ChartFrame>
  );
}

// ============================================================
// Confidence vs Win rate combo chart
// Bars = trade count per bucket; line + dots = win rate per bucket
// ============================================================
export function ConfidenceVsWinRate({
  buckets,
  correlation,
}: {
  buckets: ConfidenceBucket[];
  correlation: number | null;
}) {
  const decidedBuckets = buckets.filter((b) => b.decided > 0);
  if (decidedBuckets.length === 0) {
    return <EmptyChart label="ยังไม่มี trade ที่มี confidence + outcome" />;
  }

  const W = 600;
  const H = 280;
  const PAD_L = 45;
  const PAD_R = 50;
  const PAD_T = 24;
  const PAD_B = 50;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const maxCount = Math.max(...buckets.map((b) => b.decided)) || 1;
  const slotW = innerW / buckets.length;
  const barW = slotW * 0.55;

  // Win-rate y-scale: 0..100
  const wrY = (wr: number) => PAD_T + (1 - wr / 100) * innerH;
  // Count y-scale: 0..maxCount
  const cntY = (n: number) => PAD_T + (1 - n / maxCount) * innerH;

  // Build line points for win-rate trend across buckets
  const linePts = buckets
    .filter((b) => b.winRate !== null)
    .map((b) => {
      const idx = buckets.indexOf(b);
      const x = PAD_L + idx * slotW + slotW / 2;
      return { x, y: wrY(b.winRate as number), bucket: b };
    });

  const linePath = linePts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  const corrText =
    correlation === null
      ? "—"
      : `${correlation >= 0 ? "+" : ""}${correlation.toFixed(3)}`;
  const corrLabel =
    correlation === null
      ? "ข้อมูลน้อยเกินไป"
      : correlation >= 0.3
      ? "📈 สูง — confidence สูง = กำไรสูง (สัญญาณดี)"
      : correlation >= 0.1
      ? "↗️ บวกอ่อน — confidence ช่วยได้บ้าง"
      : correlation > -0.1
      ? "↔️ ไม่มีความสัมพันธ์ชัด"
      : correlation > -0.3
      ? "↘️ ลบอ่อน — confidence สูงไม่ช่วย"
      : "📉 ลบสูง — confidence ตรงข้ามกับผล (สัญญาณเสีย)";

  return (
    <ChartFrame
      title="🎯 Confidence vs Win rate"
      subtitle={`AI confidence buckets · correlation r = ${corrText}`}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {/* Y-axis grid lines (win rate) */}
        {[0, 25, 50, 75, 100].map((wr) => (
          <g key={wr}>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={wrY(wr)}
              y2={wrY(wr)}
              stroke="rgba(148,163,184,0.1)"
              strokeWidth={1}
            />
            <text x={W - PAD_R + 4} y={wrY(wr) + 3} fontSize="9" fill="#64748b">
              {wr}%
            </text>
          </g>
        ))}

        {/* 50% reference */}
        <line
          x1={PAD_L}
          x2={W - PAD_R}
          y1={wrY(50)}
          y2={wrY(50)}
          stroke="rgba(251,191,36,0.4)"
          strokeWidth={1}
          strokeDasharray="4 4"
        />

        {/* Left axis: count labels */}
        <text x={PAD_L - 5} y={PAD_T + 8} fontSize="9" fill="#64748b" textAnchor="end">
          {maxCount}
        </text>
        <text x={PAD_L - 5} y={cntY(0) + 3} fontSize="9" fill="#64748b" textAnchor="end">
          0
        </text>

        {/* Bars (trade count) */}
        {buckets.map((b, i) => {
          const x = PAD_L + i * slotW + (slotW - barW) / 2;
          const y = cntY(b.decided);
          const h = cntY(0) - y;
          const positive = (b.winRate ?? 0) >= 50;
          const fill =
            b.decided === 0
              ? "rgba(71,85,105,0.3)"
              : positive
              ? "rgba(52,211,153,0.4)"
              : "rgba(248,113,113,0.4)";
          return (
            <g key={b.label}>
              <rect x={x} y={y} width={barW} height={h} fill={fill} stroke="rgba(148,163,184,0.3)">
                <title>
                  {b.label}: {b.decided} trades, {b.wins}W/{b.losses}L
                  {b.winRate !== null && ` · win rate ${b.winRate}%`}
                  {b.avgPnl !== null && ` · avg ${b.avgPnl >= 0 ? "+" : ""}${b.avgPnl}%`}
                </title>
              </rect>
              {/* count label on bar */}
              {b.decided > 0 && (
                <text
                  x={x + barW / 2}
                  y={y - 4}
                  textAnchor="middle"
                  fontSize="9"
                  fill="#cbd5e1"
                >
                  {b.decided}
                </text>
              )}
              {/* x label */}
              <text
                x={PAD_L + i * slotW + slotW / 2}
                y={H - 28}
                textAnchor="middle"
                fontSize="10"
                fill="#94a3b8"
              >
                {b.label}
              </text>
              {/* avg PnL below x-label */}
              {b.avgPnl !== null && (
                <text
                  x={PAD_L + i * slotW + slotW / 2}
                  y={H - 14}
                  textAnchor="middle"
                  fontSize="8"
                  fill={b.avgPnl >= 0 ? "#34d399" : "#f87171"}
                >
                  {b.avgPnl >= 0 ? "+" : ""}
                  {b.avgPnl}%
                </text>
              )}
            </g>
          );
        })}

        {/* Win-rate line */}
        {linePts.length >= 2 && (
          <path
            d={linePath}
            fill="none"
            stroke="#38bdf8"
            strokeWidth={2}
            strokeLinejoin="round"
          />
        )}

        {/* Win-rate dots */}
        {linePts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={4} fill="#38bdf8" stroke="#0f172a" strokeWidth={1.5}>
            <title>
              {p.bucket.label}: win rate {p.bucket.winRate}%
            </title>
          </circle>
        ))}

        {/* Right axis label */}
        <text
          x={W - 4}
          y={PAD_T - 8}
          textAnchor="end"
          fontSize="9"
          fill="#38bdf8"
          fontWeight="bold"
        >
          Win rate %
        </text>
        {/* Left axis label */}
        <text x={PAD_L} y={PAD_T - 8} fontSize="9" fill="#cbd5e1" fontWeight="bold">
          Bars = trade count
        </text>
      </svg>

      <div className="mt-3 rounded-md border border-crypto-border bg-black/30 p-3 text-xs">
        <div className="font-semibold text-slate-300">Correlation: {corrText}</div>
        <div className="mt-1 text-slate-400">{corrLabel}</div>
        <div className="mt-2 text-[10px] text-slate-500">
          ค่า Pearson correlation ระหว่าง AI confidence (0-100) กับ PnL (%) ของ trade ที่จบแล้ว.
          ค่าใกล้ +1 = confidence สูงทำนายผลดีได้แม่น · ค่าใกล้ 0 = ไม่มีความสัมพันธ์ ·
          ค่าติดลบ = AI ใช้ confidence ตรงกันข้ามกับผลจริง (ต้อง tune AI prompt)
        </div>
      </div>
    </ChartFrame>
  );
}

// ============================================================
// Helpers
// ============================================================
function ChartFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-crypto-border bg-crypto-panel p-4 shadow-lg">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        {subtitle && <span className="text-xs text-slate-500">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-40 items-center justify-center rounded-xl border border-crypto-border bg-crypto-panel/50 text-xs text-slate-500">
      {label}
    </div>
  );
}
