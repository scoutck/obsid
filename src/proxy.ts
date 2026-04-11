import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { adminPrisma } from "@/lib/admin-db";

const PUBLIC_PATHS = ["/login", "/signup", "/api/auth/", "/api/mcp/"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

// Cache user DB credentials to avoid admin DB lookup on every request
const USER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const userCache = new Map<string, { tursoDbUrl: string; tursoDbToken: string; username: string; cachedAt: number }>();

async function getUserCredentials(userId: string): Promise<{ tursoDbUrl: string; tursoDbToken: string; username: string } | null> {
  const cached = userCache.get(userId);
  if (cached && Date.now() - cached.cachedAt < USER_CACHE_TTL) {
    return cached;
  }

  const user = await adminPrisma.user.findUnique({
    where: { id: userId },
  });
  if (!user) return null;

  userCache.set(userId, {
    tursoDbUrl: user.tursoDbUrl,
    tursoDbToken: user.tursoDbToken,
    username: user.username,
    cachedAt: Date.now(),
  });

  return user;
}

async function handleApiKeyAuth(request: NextRequest, key: string): Promise<NextResponse> {
  let apiKey;
  try {
    apiKey = await adminPrisma.apiKey.findUnique({ where: { key } });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Update lastUsedAt (fire-and-forget)
  adminPrisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {});

  // In dev mode, skip remote DB routing
  if (process.env.NODE_ENV !== "production") {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-id", apiKey.userId);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const user = await getUserCredentials(apiKey.userId);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-db-url", user.tursoDbUrl);
  requestHeaders.set("x-user-db-token", user.tursoDbToken);
  requestHeaders.set("x-user-id", apiKey.userId);
  requestHeaders.set("x-username", user.username);

  return NextResponse.next({ request: { headers: requestHeaders } });
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
    // API routes may authenticate via API key instead of JWT cookie
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer obsid_")) {
      return handleApiKeyAuth(request, authHeader.slice(7));
    }
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

  // In dev mode, skip remote DB routing — use local dev.db instead
  if (process.env.NODE_ENV !== "production") {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-id", payload.sub);
    requestHeaders.set("x-username", payload.username);
    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  // Look up user's DB credentials (cached)
  const user = await getUserCredentials(payload.sub);
  if (!user) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete("token");
    return response;
  }

  // Inject DB credentials into request headers for downstream API routes
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-db-url", user.tursoDbUrl);
  requestHeaders.set("x-user-db-token", user.tursoDbToken);
  requestHeaders.set("x-user-id", payload.sub);
  requestHeaders.set("x-username", user.username);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
