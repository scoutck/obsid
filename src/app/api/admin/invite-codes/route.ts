import { NextRequest } from "next/server";
import { adminPrisma } from "@/lib/admin-db";
import { randomUUID } from "crypto";

export async function POST(request: NextRequest) {
  // Only allow the admin user
  const username = request.headers.get("x-username");
  if (username !== process.env.ADMIN_USERNAME) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const code =
    randomUUID().slice(0, 8) + "-" + randomUUID().slice(0, 8);

  await adminPrisma.inviteCode.create({
    data: { id: randomUUID(), code },
  });

  return Response.json({ code });
}

export async function GET(request: NextRequest) {
  const username = request.headers.get("x-username");
  if (username !== process.env.ADMIN_USERNAME) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const codes = await adminPrisma.inviteCode.findMany({
    orderBy: { createdAt: "desc" },
  });

  return Response.json(codes);
}
