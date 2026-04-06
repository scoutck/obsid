import { prisma as defaultPrisma } from "@/lib/db";
import type { PrismaClient } from "@prisma/client";
import { parseCollection, type Collection, type CollectionFilter } from "@/types";

interface CreateCollectionInput {
  name: string;
  filter: CollectionFilter;
}

export async function createCollection(
  input: CreateCollectionInput,
  db: PrismaClient = defaultPrisma
): Promise<Collection> {
  const raw = await db.collection.create({
    data: {
      name: input.name,
      filter: JSON.stringify(input.filter),
    },
  });
  return parseCollection(raw);
}

export async function getCollection(id: string, db: PrismaClient = defaultPrisma): Promise<Collection | null> {
  const raw = await db.collection.findUnique({ where: { id } });
  if (!raw) return null;
  return parseCollection(raw);
}

export async function listCollections(db: PrismaClient = defaultPrisma): Promise<Collection[]> {
  const raw = await db.collection.findMany({
    orderBy: { createdAt: "desc" },
  });
  return raw.map(parseCollection);
}

export async function deleteCollection(id: string, db: PrismaClient = defaultPrisma): Promise<void> {
  await db.collection.delete({ where: { id } });
}
