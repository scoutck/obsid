import { NextRequest } from "next/server";
import { adminPrisma } from "@/lib/admin-db";
import { verifyPassword, createToken } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const { username, password } = await request.json();

  if (!username || !password) {
    return Response.json(
      { error: "Username and password are required" },
      { status: 400 }
    );
  }

  const user = await adminPrisma.user.findUnique({
    where: { username },
  });
  if (!user) {
    return Response.json(
      { error: "Invalid username or password" },
      { status: 401 }
    );
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return Response.json(
      { error: "Invalid username or password" },
      { status: 401 }
    );
  }

  const token = await createToken({ sub: user.id, username: user.username });

  const response = Response.json({ success: true, username: user.username });
  const headers = new Headers(response.headers);
  headers.append(
    "Set-Cookie",
    `token=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${30 * 24 * 60 * 60}`
  );

  return new Response(response.body, {
    status: 200,
    headers,
  });
}
