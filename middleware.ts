import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth/session";

// Paths that bypass auth entirely.
// These either have their own secret-based auth, are static assets, or are
// the auth pages themselves.
const PUBLIC_PATH_PREFIXES = [
  "/login",
  "/api/auth",
  "/api/webhook",      // TradingView webhook (validates secret)
  "/api/backtest",     // Cloud Scheduler / dashboard (validates secret)
  "/api/schedule",     // Schedule mgmt (validates secret on PATCH)
  "/_next",
  "/favicon",
  "/robots.txt",
  "/sitemap.xml",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p + "."))) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySessionToken(token ?? null);

  if (!session) {
    const loginUrl = new URL("/login", req.url);
    if (pathname !== "/" && !pathname.startsWith("/login")) {
      loginUrl.searchParams.set("next", pathname + req.nextUrl.search);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Run on every request except static asset extensions handled above.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
