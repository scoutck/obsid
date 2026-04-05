import { prisma } from "@/lib/db";
import { parseCollection, type Collection, type CollectionFilter } from "@/types";

interface CreateCollectionInput {
  name: string;
  filter: CollectionFilter;
}

export async function createCollection(
  input: CreateCollectionInput
): Promise<Collection> {
  const raw = await prisma.collection.create({
    data: {
      name: input.name,
      filter: JSON.stringify(input.filter),
    },
  });
  return parseCollection(raw);
}

export async function getCollection(id: string): Promise<Collection | null> {
  const raw = await prisma.collection.findUnique({ where: { id } });
  if (!raw) return null;
  return parseCollection(raw);
}

export async function listCollections(): Promise<Collection[]> {
  const raw = await prisma.collection.findMany({
    orderBy: { createdAt: "desc" },
  });
  return raw.map(parseCollection);
}

export async function deleteCollection(id: string): Promise<void> {
  await prisma.collection.delete({ where: { id } });
}
