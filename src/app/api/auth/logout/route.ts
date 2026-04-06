export async function POST() {
  const response = Response.json({ success: true });
  const headers = new Headers(response.headers);
  headers.append(
    "Set-Cookie",
    "token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"
  );

  return new Response(response.body, { status: 200, headers });
}
