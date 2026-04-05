import { describe, it, expect, beforeEach } from "vitest";
import {
  createCollection,
  getCollection,
  listCollections,
  deleteCollection,
} from "@/lib/collections";
import { prisma } from "@/lib/db";

beforeEach(async () => {
  await prisma.collection.deleteMany();
});

describe("createCollection", () => {
  it("creates a collection with filter", async () => {
    const col = await createCollection({
      name: "Decisions",
      filter: { tags: ["decision"] },
    });
    expect(col.id).toBeDefined();
    expect(col.name).toBe("Decisions");
    expect(col.filter).toEqual({ tags: ["decision"] });
  });
});

describe("listCollections", () => {
  it("returns all collections", async () => {
    await createCollection({ name: "A", filter: { tags: ["a"] } });
    await createCollection({ name: "B", filter: { type: "idea" } });
    const cols = await listCollections();
    expect(cols).toHaveLength(2);
  });
});

describe("deleteCollection", () => {
  it("deletes a collection", async () => {
    const col = await createCollection({ name: "Del", filter: {} });
    await deleteCollection(col.id);
    const found = await getCollection(col.id);
    expect(found).toBeNull();
  });
});
