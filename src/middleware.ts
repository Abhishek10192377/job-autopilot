import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/server/auth/session";

const PUBLIC = new Set(["/login", "/api/auth/login"]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  // State-changing requests must come from this site (CSRF protection alongside the SameSite cookie).
  if (isApi && !["GET", "HEAD"].includes(req.method)) {
    const origin = req.headers.get("origin");
    let sameSite = !origin;
    try {
      if (origin) sameSite = new URL(origin).host === req.headers.get("host");
    } catch {
      sameSite = false;
    }
    if (!sameSite) return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  }

  if (PUBLIC.has(pathname)) return NextResponse.next();
  if (await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  if (isApi) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
