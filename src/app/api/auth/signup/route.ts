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

  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return Response.json(
      { error: "Username can only contain letters, numbers, hyphens, and underscores" },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return Response.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  // Atomically claim the invite code (prevents race condition)
  const claimed = await adminPrisma.inviteCode.updateMany({
    where: { code: inviteCode, usedBy: null },
    data: { usedBy: "pending", usedAt: new Date() },
  });
  if (claimed.count === 0) {
    return Response.json(
      { error: "Invalid or already used invite code" },
      { status: 400 }
    );
  }

  // Provision user database and create user record
  // Wrapped in try/catch to release invite code on any failure
  let userId: string;
  let tursoDbUrl: string;
  let tursoDbToken: string;

  try {
    const provisioned = await provisionUserDb(username);
    tursoDbUrl = provisioned.url;
    tursoDbToken = provisioned.authToken;
  } catch (err) {
    // Turso provisioning failed — release the invite code
    await adminPrisma.inviteCode.updateMany({
      where: { code: inviteCode, usedBy: "pending" },
      data: { usedBy: null, usedAt: null },
    });
    console.error("[signup] DB provisioning failed:", err);
    return Response.json(
      { error: "Failed to create account. Please try again." },
      { status: 500 }
    );
  }

  userId = randomUUID();
  const passwordHash = await hashPassword(password);

  try {
    await adminPrisma.user.create({
      data: {
        id: userId,
        username,
        passwordHash,
        tursoDbUrl,
        tursoDbToken,
      },
    });
  } catch {
    // Username uniqueness constraint failed — release invite code
    // Note: orphaned Turso DB may remain; logged for manual cleanup
    console.error(`[signup] User creation failed for "${username}". Orphaned Turso DB: ${tursoDbUrl}`);
    await adminPrisma.inviteCode.updateMany({
      where: { code: inviteCode, usedBy: "pending" },
      data: { usedBy: null, usedAt: null },
    });
    return Response.json(
      { error: "Username already taken" },
      { status: 400 }
    );
  }

  // Finalize invite code with actual user ID
  await adminPrisma.inviteCode.update({
    where: { code: inviteCode },
    data: { usedBy: userId },
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
