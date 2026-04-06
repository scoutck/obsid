import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { createPerson } from "@/lib/people";

export async function POST(request: NextRequest) {
  const db = getDb(request);
  const { name, role, userContext } = await request.json();

  // createPerson auto-prepends input.name to aliases
  const extraAliases: string[] = [];
  const firstName = name.split(" ")[0];
  if (firstName !== name) extraAliases.push(firstName);

  const person = await createPerson({
    name,
    aliases: extraAliases,
    role: role ?? "",
    userContext: userContext ?? "",
    content: `# ${name}\n\n${role ? `**Role:** ${role}\n\n` : ""}${userContext ? userContext + "\n" : ""}`,
  }, db);

  return Response.json(person, { status: 201 });
}
