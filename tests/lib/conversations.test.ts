import { describe, it, expect, beforeEach } from "vitest";
import {
  createConversation,
  getConversation,
  getMostRecentConversation,
  addMessage,
  getMessages,
} from "@/lib/conversations";
import { prisma } from "@/lib/db";

beforeEach(async () => {
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
});

describe("conversations", () => {
  it("creates a conversation with a title", async () => {
    const conv = await createConversation("Test Chat");
    expect(conv.title).toBe("Test Chat");
    expect(conv.id).toBeDefined();
  });

  it("retrieves a conversation by id", async () => {
    const conv = await createConversation("My Chat");
    const fetched = await getConversation(conv.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.title).toBe("My Chat");
  });

  it("returns the most recent conversation", async () => {
    await createConversation("Old Chat");
    const newer = await createConversation("New Chat");
    const recent = await getMostRecentConversation();
    expect(recent).not.toBeNull();
    expect(recent!.id).toBe(newer.id);
  });

  it("returns null when no conversations exist", async () => {
    const recent = await getMostRecentConversation();
    expect(recent).toBeNull();
  });
});

describe("messages", () => {
  it("adds and retrieves messages for a conversation", async () => {
    const conv = await createConversation("Chat");
    await addMessage(conv.id, "user", "Hello");
    await addMessage(conv.id, "assistant", "Hi there!");

    const messages = await getMessages(conv.id, 20);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("Hello");
    expect(messages[1].role).toBe("assistant");
    expect(messages[1].content).toBe("Hi there!");
  });

  it("respects the limit parameter", async () => {
    const conv = await createConversation("Chat");
    for (let i = 0; i < 5; i++) {
      await addMessage(conv.id, "user", `Message ${i}`);
    }

    const messages = await getMessages(conv.id, 3);
    expect(messages).toHaveLength(3);
    // Should return the 3 most recent messages, in chronological order
    expect(messages[0].content).toBe("Message 2");
    expect(messages[2].content).toBe("Message 4");
  });

  it("stores toolCalls as JSON", async () => {
    const conv = await createConversation("Chat");
    const toolCalls = [{ name: "search_notes", input: { query: "test" } }];
    await addMessage(conv.id, "assistant", "Searching...", toolCalls);

    const messages = await getMessages(conv.id, 10);
    expect(messages[0].toolCalls).toEqual(toolCalls);
  });
});
