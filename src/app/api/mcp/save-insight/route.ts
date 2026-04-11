import { NextRequest } from "next/server";
import { validateApiKey } from "@/lib/mcp-auth";
import { createUserInsight } from "@/lib/user-insights";
import { getPersonByAlias } from "@/lib/people";
import { createPendingPerson } from "@/lib/pending-people";

export async function POST(request: NextRequest) {
  const auth = await validateApiKey(request);
  if (!auth) {
    return Response.json({ error: "Invalid API key" }, { status: 401 });
  }

  const body = await request.json();
  const { category, content, evidence, personName, relatedTopics } = body;

  if (!category || !content || !evidence) {
    return Response.json(
      { error: "category, content, and evidence are required" },
      { status: 400 }
    );
  }

  // Append related topics to evidence if provided
  let fullEvidence = evidence;
  if (relatedTopics?.length > 0) {
    fullEvidence += ` [Topics: ${relatedTopics.join(", ")}]`;
  }

  const insight = await createUserInsight(
    {
      category,
      content,
      evidence: fullEvidence,
      source: "claude-desktop",
    },
    auth.db
  );

  // Handle person linking if provided
  if (personName) {
    const person = await getPersonByAlias(personName, auth.db);
    if (!person) {
      // Create PendingPerson for review
      await createPendingPerson(
        {
          name: personName,
          context: `Claude Desktop insight: ${content}`,
        },
        auth.db
      );
    }
  }

  return Response.json({ insightId: insight.id }, { status: 201 });
}
