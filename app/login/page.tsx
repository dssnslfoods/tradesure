import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import LoginForm from "./LoginForm";
import Logo from "@/components/ui/Logo";
import Icon from "@/components/ui/Icon";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const c = await cookies();
  const session = await verifySessionToken(c.get(SESSION_COOKIE)?.value ?? null);
  const params = await searchParams;
  if (session) redirect(params.next ?? "/dashboard");

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden">
      {/* Background blobs */}
      <span
        className="blob"
        style={{
          width: 480,
          height: 480,
          top: -120,
          left: -100,
          background: "radial-gradient(circle, var(--accent) 0%, transparent 70%)",
        }}
      />
      <span
        className="blob"
        style={{
          width: 520,
          height: 520,
          bottom: -180,
          right: -120,
          background: "radial-gradient(circle, var(--info) 0%, transparent 70%)",
          animationDelay: "-7s",
        }}
      />
      <span
        className="blob"
        style={{
          width: 360,
          height: 360,
          top: "40%",
          right: "20%",
          background: "radial-gradient(circle, var(--violet) 0%, transparent 70%)",
          animationDelay: "-14s",
        }}
      />

      {/* Grid overlay */}
      <div className="bg-grid pointer-events-none absolute inset-0" aria-hidden="true" />

      {/* Top live ticker */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2">
        <div className="glass flex items-center gap-3 rounded-full px-4 py-2 text-[11px]">
          <span className="pulse-dot" />
          <span className="text-ink-secondary">Live</span>
          <span className="text-ink-faint">·</span>
          <span className="font-mono text-ink-primary">BTCUSDT 80,777</span>
          <span className="text-ink-faint">·</span>
          <span className="font-mono text-sig-buy">+1.24%</span>
        </div>
      </div>

      {/* Decorative chart line at bottom */}
      <svg
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-24 w-full opacity-30"
        viewBox="0 0 1200 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="loginline" x1="0" x2="1200" y1="0" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0" />
            <stop offset="0.5" stopColor="var(--accent)" stopOpacity="0.7" />
            <stop offset="1" stopColor="var(--info)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M0 70 Q 200 50, 400 60 T 800 40 T 1200 50"
          fill="none"
          stroke="url(#loginline)"
          strokeWidth="1.5"
        />
      </svg>

      {/* Card */}
      <div className="relative z-10 flex flex-col items-center px-4">
        <div className="mb-6 flex flex-col items-center">
          <Logo size={42} />
          <div className="mt-3 text-center">
            <div className="text-[18px] font-bold tracking-tightest text-ink-primary">
              Tradesure
            </div>
            <div
              className="mt-0.5 bg-clip-text text-[10px] font-semibold uppercase tracking-eyebrow text-transparent"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, var(--accent-hi), var(--info))",
              }}
            >
              by D2infinite
            </div>
          </div>
        </div>

        <LoginForm next={params.next} />

        <p className="mt-6 flex items-center gap-2 text-[11px] text-ink-muted">
          <Icon name="user-plus" size={12} />
          ยังไม่มี account? ส่ง <code className="font-mono text-brand">/start</code> ไปหา bot →
          ติดต่อ admin เพื่อเพิ่มสิทธิ์
        </p>
      </div>
    </main>
  );
}
