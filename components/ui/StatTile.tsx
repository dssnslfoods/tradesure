import AnimNumber from "./AnimNumber";
import Sparkline from "./Sparkline";
import Icon, { type IconName } from "./Icon";

interface Props {
  label: string;
  value: number | string;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  sub?: string;
  icon?: IconName;
  tone?: "neutral" | "buy" | "sell" | "warn" | "info" | "violet";
  sparkline?: number[];
  sparkColor?: string;
}

export default function StatTile({
  label,
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  sub,
  icon,
  tone = "neutral",
  sparkline,
  sparkColor,
}: Props) {
  const toneColor = {
    neutral: "text-ink-primary",
    buy: "text-sig-buy",
    sell: "text-sig-sell",
    warn: "text-sig-warn",
    info: "text-sig-info",
    violet: "text-sig-violet",
  }[tone];

  const iconBg = {
    neutral: "bg-surface-2 text-ink-secondary",
    buy: "bg-sig-buy/15 text-sig-buy",
    sell: "bg-sig-sell/15 text-sig-sell",
    warn: "bg-sig-warn/15 text-sig-warn",
    info: "bg-sig-info/15 text-sig-info",
    violet: "bg-sig-violet/15 text-sig-violet",
  }[tone];

  const sparkResolved = sparkColor ?? {
    neutral: "var(--accent)",
    buy: "var(--buy)",
    sell: "var(--sell)",
    warn: "var(--warn)",
    info: "var(--info)",
    violet: "var(--violet)",
  }[tone];

  return (
    <div className="card relative overflow-hidden p-[18px]">
      <div className="flex items-start justify-between">
        <div>
          <div className="eyebrow">{label}</div>
          <div className={`mt-2 text-[28px] font-bold tracking-tightest ${toneColor}`}>
            {typeof value === "number" ? (
              <AnimNumber
                value={value}
                decimals={decimals}
                prefix={prefix}
                suffix={suffix}
              />
            ) : (
              <span className="tabular">
                {prefix}
                {value}
                {suffix}
              </span>
            )}
          </div>
          {sub && (
            <div className="mt-1 text-[11px] text-ink-muted">{sub}</div>
          )}
        </div>
        {icon && (
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${iconBg}`}
          >
            <Icon name={icon} size={18} />
          </span>
        )}
      </div>
      {sparkline && sparkline.length > 1 && (
        <div className="-mx-2 mt-2">
          <Sparkline
            data={sparkline}
            width={220}
            height={36}
            color={sparkResolved}
          />
        </div>
      )}
    </div>
  );
}
