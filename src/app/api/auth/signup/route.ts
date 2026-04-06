import { NextRequest } from "next/server";
import { adminPrisma } from "@/lib/admin-db";
import { hashPassword, createToken } from "@/lib/auth";
import { provisionUserDb } from "@/../scripts/provision-user-db";
import { randomUUID } from "crypto";

export async function POST(request: NextRequest) {
  const { username, password, inviteCode } = await request.json();

  if (!username || !password || !inviteCode) {
    return Response.json(
      { error: "Username, password, and invite code are required" },
      { status: 400 }
    );
  }

  if (username.length < 3 || username.length > 30) {
    return Response.json(
      { error: "Username must be 3-30 characters" },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return Response.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  // Validate invite code
  const code = await adminPrisma.inviteCode.findUnique({
    where: { code: inviteCode },
  });
  if (!code || code.usedBy) {
    return Response.json(
      { error: "Invalid or already used invite code" },
      { status: 400 }
    );
  }

  // Check username availability
  const existingUser = await adminPrisma.user.findUnique({
    where: { username },
  });
  if (existingUser) {
    return Response.json(
      { error: "Username already taken" },
      { status: 400 }
    );
  }

  // Provision user database
  const { url: tursoDbUrl, authToken: tursoDbToken } =
    await provisionUserDb(username);

  // Create user
  const userId = randomUUID();
  const passwordHash = await hashPassword(password);

  await adminPrisma.user.create({
    data: {
      id: userId,
      username,
      passwordHash,
      tursoDbUrl,
      tursoDbToken,
    },
  });

  // Mark invite code as used
  await adminPrisma.inviteCode.update({
    where: { code: inviteCode },
    data: { usedBy: userId, usedAt: new Date() },
  });

  // Issue JWT
  const token = await createToken({ sub: userId, username });

  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const response = Response.json({ success: true, username });
  const headers = new Headers(response.headers);
  headers.append(
    "Set-Cookie",
    `token=${token}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=${30 * 24 * 60 * 60}`
  );

  return new Response(response.body, {
    status: 200,
    headers,
  });
}
