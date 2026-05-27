import { NextRequest, NextResponse } from "next/server";

// Optional site-wide password gate (HTTP Basic Auth).
// Set SITE_PASSWORD (and optionally SITE_AUTH_USER, default "admin") to lock the
// whole site. Leave SITE_PASSWORD unset to make the site public.
export function middleware(req: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return NextResponse.next(); // gate disabled

  const expectedUser = process.env.SITE_AUTH_USER || "admin";
  const auth = req.headers.get("authorization");

  if (auth?.startsWith("Basic ")) {
    try {
      const [user, pass] = atob(auth.slice(6)).split(":");
      if (user === expectedUser && pass === password) {
        return NextResponse.next();
      }
    } catch {
      // fall through to 401
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Private", charset="UTF-8"' },
  });
}

// Protect everything except Next internals and the favicon/icon.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
