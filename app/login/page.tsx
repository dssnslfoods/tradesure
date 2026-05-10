import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import LoginForm from "./LoginForm";
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
  if (session) {
    redirect(params.next ?? "/dashboard");
  }

  return (
    <main className="flex min-h-[calc(100vh-80px)] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold tracking-tight">
            🔐 <span className="text-slate-100">Tradesure</span>
          </h1>
          <div className="mt-1 bg-gradient-to-r from-emerald-400 to-sky-400 bg-clip-text text-xs font-semibold uppercase tracking-widest text-transparent">
            by D2infinite
          </div>
          <p className="mt-3 text-sm text-slate-400">
            เข้าสู่ระบบด้วยรหัส OTP ที่ส่งผ่าน Telegram
          </p>
        </div>
        <LoginForm next={params.next} />
        <p className="mt-6 text-center text-xs text-slate-500">
          ยังไม่มี account? ติดต่อผู้ดูแลระบบเพื่อเพิ่มสิทธิ์การใช้งาน
        </p>
      </div>
    </main>
  );
}
