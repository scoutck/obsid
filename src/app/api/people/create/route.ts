import { NextRequest } from "next/server";
import { createPerson } from "@/lib/people";

export async function POST(request: NextRequest) {
  const { name, role, userContext } = await request.json();

  const aliases = [name];
  const firstName = name.split(" ")[0];
  if (firstName !== name) aliases.push(firstName);

  const person = await createPerson({
    name,
    aliases,
    role: role ?? "",
    userContext: userContext ?? "",
    content: `# ${name}\n\n${role ? `**Role:** ${role}\n\n` : ""}${userContext ? userContext + "\n" : ""}`,
  });

  return Response.json(person, { status: 201 });
}
