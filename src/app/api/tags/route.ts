import { getTagVocabulary } from "@/lib/tags";

export async function GET() {
  const vocabulary = await getTagVocabulary();
  return Response.json(vocabulary);
}
