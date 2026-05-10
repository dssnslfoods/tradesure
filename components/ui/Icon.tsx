// Tabler-style line icons (1.75 stroke). Inline SVG to avoid bundle bloat.
// Add new glyphs to ICONS as needed; mapped to tabler-icons names.

type IconName =
  | "dashboard"
  | "chart-line"
  | "flame"
  | "users"
  | "settings"
  | "bell"
  | "search"
  | "logout"
  | "login"
  | "key"
  | "shield"
  | "shield-check"
  | "robot"
  | "send"
  | "telegram"
  | "edit"
  | "trash"
  | "external"
  | "chart-candle"
  | "trending-up"
  | "trending-down"
  | "droplet"
  | "star"
  | "star-filled"
  | "diamond"
  | "ban"
  | "circle-check"
  | "circle-x"
  | "clock"
  | "refresh"
  | "play"
  | "pause"
  | "plus"
  | "minus"
  | "check"
  | "x"
  | "chevron-down"
  | "chevron-right"
  | "alert-triangle"
  | "filter"
  | "download"
  | "upload"
  | "wallet"
  | "currency-dollar"
  | "user"
  | "user-plus"
  | "command"
  | "menu"
  | "wave"
  | "info"
  | "eye"
  | "eye-off"
  | "lightning"
  | "rocket"
  | "lock"
  | "calendar"
  | "history"
  | "globe"
  | "device-analytics"
  | "arrow-up-right"
  | "arrow-down-right"
  | "scale"
  | "target"
  | "spy";

const ICONS: Record<IconName, string> = {
  dashboard: '<path d="M4 4h6v8H4zM14 4h6v6h-6zM14 14h6v6h-6zM4 16h6v4H4z" />',
  "chart-line": '<path d="M3 3v18h18" /><path d="M7 14l4-4 4 3 6-7" />',
  flame: '<path d="M12 12c-2-3-1-5 1-7 1 4 4 5 4 9a5 5 0 0 1-10 0c0-2 1-4 3-5-1 2-1 4 2 3" />',
  users:
    '<circle cx="9" cy="7" r="4" /><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /><path d="M21 21v-2a4 4 0 0 0-3-3.85" />',
  settings:
    '<path d="M10.325 4.317a1.5 1.5 0 0 1 3.35 0l.094.453a1.5 1.5 0 0 0 1.998 1.107l.43-.18a1.5 1.5 0 0 1 1.918 1.918l-.18.43a1.5 1.5 0 0 0 1.107 1.998l.453.094a1.5 1.5 0 0 1 0 3.35l-.453.094a1.5 1.5 0 0 0-1.107 1.998l.18.43a1.5 1.5 0 0 1-1.918 1.918l-.43-.18a1.5 1.5 0 0 0-1.998 1.107l-.094.453a1.5 1.5 0 0 1-3.35 0l-.094-.453a1.5 1.5 0 0 0-1.998-1.107l-.43.18a1.5 1.5 0 0 1-1.918-1.918l.18-.43a1.5 1.5 0 0 0-1.107-1.998l-.453-.094a1.5 1.5 0 0 1 0-3.35l.453-.094a1.5 1.5 0 0 0 1.107-1.998l-.18-.43a1.5 1.5 0 0 1 1.918-1.918l.43.18a1.5 1.5 0 0 0 1.998-1.107z" /><circle cx="12" cy="12" r="3" />',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a2 2 0 0 0 3.4 0" />',
  search: '<circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" />',
  logout:
    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" />',
  login:
    '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="M10 17l-5-5 5-5" /><path d="M15 12H3" />',
  key:
    '<circle cx="7" cy="15" r="4" /><path d="M10 12l11-11" /><path d="M16 7l3 3" /><path d="M19 4l3 3" />',
  shield: '<path d="M12 3l8 4v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" />',
  "shield-check":
    '<path d="M12 3l8 4v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" /><path d="M9 12l2 2 4-4" />',
  robot:
    '<rect x="3" y="8" width="18" height="12" rx="2" /><path d="M12 4v4" /><circle cx="9" cy="14" r="1.5" /><circle cx="15" cy="14" r="1.5" /><path d="M8 4h8" />',
  send: '<path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" />',
  telegram:
    '<path d="M22 2L2 11l8 3 3 8 9-20z" /><path d="M10 14l4-3" />',
  edit:
    '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />',
  trash:
    '<path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M10 11v6M14 11v6" />',
  external:
    '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><path d="M15 3h6v6" /><path d="M10 14L21 3" />',
  "chart-candle":
    '<path d="M9 5v3M9 16v3M15 3v5M15 14v7" /><rect x="7" y="8" width="4" height="8" rx="1" /><rect x="13" y="8" width="4" height="6" rx="1" />',
  "trending-up": '<path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" />',
  "trending-down": '<path d="M3 7l6 6 4-4 8 8" /><path d="M14 17h7v-7" />',
  droplet: '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.32 0z" />',
  star:
    '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" />',
  "star-filled":
    '<path fill="currentColor" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" />',
  diamond:
    '<path d="M6 3h12l4 6-10 12L2 9z" /><path d="M11 3l-2 6h6l-2-6" />',
  ban: '<circle cx="12" cy="12" r="10" /><path d="M5 5l14 14" />',
  "circle-check": '<circle cx="12" cy="12" r="10" /><path d="M9 12l2 2 4-4" />',
  "circle-x": '<circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6M9 9l6 6" />',
  clock: '<circle cx="12" cy="12" r="10" /><path d="M12 7v5l3 2" />',
  refresh:
    '<path d="M4 4v6h6" /><path d="M20 20v-6h-6" /><path d="M5 14a8 8 0 0 0 13 4l2-2" /><path d="M19 10A8 8 0 0 0 6 6L4 8" />',
  play: '<path d="M6 4l14 8-14 8z" fill="currentColor" />',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" />',
  plus: '<path d="M12 5v14M5 12h14" />',
  minus: '<path d="M5 12h14" />',
  check: '<path d="M5 12l5 5 9-11" />',
  x: '<path d="M18 6L6 18M6 6l12 12" />',
  "chevron-down": '<path d="M6 9l6 6 6-6" />',
  "chevron-right": '<path d="M9 6l6 6-6 6" />',
  "alert-triangle":
    '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" />',
  filter:
    '<path d="M22 3H2l8 9.46V19l4 2v-8.54z" />',
  download:
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" />',
  upload:
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" />',
  wallet:
    '<rect x="2" y="6" width="20" height="14" rx="2" /><path d="M22 10H18a2 2 0 0 0 0 4h4" />',
  "currency-dollar":
    '<path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 1 1 0 7H6" /><path d="M12 3v3M12 18v3" />',
  user:
    '<circle cx="12" cy="8" r="4" /><path d="M4 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2" />',
  "user-plus":
    '<circle cx="9" cy="8" r="4" /><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" /><path d="M19 8v6M16 11h6" />',
  command:
    '<path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" />',
  menu: '<path d="M3 12h18M3 6h18M3 18h18" />',
  wave: '<path d="M3 12c2 0 2-3 4-3s2 6 4 6 2-6 4-6 2 3 4 3" />',
  info: '<circle cx="12" cy="12" r="10" /><path d="M12 8h.01M11 12h1v4h1" />',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" />',
  "eye-off":
    '<path d="M17.94 17.94A10 10 0 0 1 12 19c-6 0-10-7-10-7a18 18 0 0 1 5.06-5.94" /><path d="M9.9 4.24A10 10 0 0 1 12 4c6 0 10 7 10 7a18 18 0 0 1-3.17 4.18" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /><path d="M2 2l20 20" />',
  lightning: '<path d="M13 2L3 14h7l-2 8 11-12h-7l2-8z" fill="currentColor" />',
  rocket:
    '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.07-2.91a2 2 0 0 0-2.93-.09z" /><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" /><path d="M9 12H4a2 2 0 0 1 2-2h3" /><path d="M12 15v5a2 2 0 0 0 2-2v-3" />',
  lock:
    '<rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />',
  calendar:
    '<rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />',
  history:
    '<path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" />',
  globe:
    '<circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" />',
  "device-analytics":
    '<rect x="3" y="4" width="18" height="14" rx="2" /><path d="M7 14l3-3 2 2 4-5" /><path d="M9 22h6" /><path d="M12 18v4" />',
  "arrow-up-right": '<path d="M7 17L17 7" /><path d="M7 7h10v10" />',
  "arrow-down-right": '<path d="M7 7l10 10" /><path d="M17 7v10H7" />',
  scale:
    '<path d="M3 7h18M6 7l-3 6a3 3 0 0 0 6 0L6 7M18 7l-3 6a3 3 0 0 0 6 0l-3-6M12 3v18M9 21h6" />',
  target:
    '<circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />',
  spy: '<circle cx="9" cy="14" r="3" /><circle cx="15" cy="14" r="3" /><path d="M9 7l-3-2h12l-3 2" /><path d="M12 14h0" />',
};

export default function Icon({
  name,
  size = 18,
  stroke = 1.75,
  className = "",
}: {
  name: IconName;
  size?: number | string;
  stroke?: number;
  className?: string;
}) {
  const path = ICONS[name];
  if (!path) return null;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: path }}
    />
  );
}

export type { IconName };
