"use client";

import { useEffect, useState } from "react";

export default function ConfidenceMeter({
  value,
  showLabel = true,
  className = "",
}: {
  value: number; // 0..100
  showLabel?: boolean;
  className?: string;
}) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setW(Math.max(0, Math.min(100, value))), 50);
    return () => clearTimeout(t);
  }, [value]);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="relative h-1.5 w-20 overflow-hidden rounded-full bg-surface-3">
        <div
          className="conf-fill h-full rounded-full"
          style={{ width: `${w}%` }}
        />
      </div>
      {showLabel && (
        <span className="tabular text-[11px] font-semibold text-brand">
          {value}%
        </span>
      )}
    </div>
  );
}
