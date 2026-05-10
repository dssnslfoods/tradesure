export default function Logo({
  size = 28,
  withText = false,
  className = "",
}: {
  size?: number;
  withText?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span
        className="relative inline-flex items-center justify-center rounded-[8px]"
        style={{
          width: size,
          height: size,
          background:
            "linear-gradient(135deg, var(--accent-hi) 0%, var(--accent-lo) 100%)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.4), 0 6px 18px rgba(0,212,170,0.4)",
        }}
      >
        <svg
          width={size * 0.6}
          height={size * 0.6}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#001b14"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 17l6-6 4 4 8-9" />
          <circle cx="20" cy="6" r="1.6" fill="#001b14" />
        </svg>
      </span>
      {withText && (
        <div className="leading-tight">
          <div className="text-[15px] font-bold tracking-tightest text-ink-primary">
            Tradesure
          </div>
          <div className="text-[9px] font-semibold uppercase tracking-eyebrow text-ink-muted">
            by D2infinite
          </div>
        </div>
      )}
    </div>
  );
}
