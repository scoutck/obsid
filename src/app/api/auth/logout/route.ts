export async function POST() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const response = Response.json({ success: true });
  const headers = new Headers(response.headers);
  headers.append(
    "Set-Cookie",
    `token=; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=0`
  );

  return new Response(response.body, { status: 200, headers });
}
