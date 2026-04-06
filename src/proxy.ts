import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { adminPrisma } from "@/lib/admin-db";

const PUBLIC_PATHS = ["/login", "/signup", "/api/auth/"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Allow static assets and Next.js internals
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon.ico")
  ) {
    return NextResponse.next();
  }

  // Check for JWT cookie
  const token = request.cookies.get("token")?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Verify JWT
  let payload: { sub: string; username: string };
  try {
    payload = await verifyToken(token);
  } catch {
    // Invalid or expired token — clear cookie and redirect
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete("token");
    return response;
  }

  // Look up user's DB credentials
  const user = await adminPrisma.user.findUnique({
    where: { id: payload.sub },
  });
  if (!user) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete("token");
    return response;
  }

  // Inject DB credentials into request headers for downstream API routes
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-db-url", user.tursoDbUrl);
  requestHeaders.set("x-user-db-token", user.tursoDbToken);
  requestHeaders.set("x-user-id", user.id);
  requestHeaders.set("x-username", user.username);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
