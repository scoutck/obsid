// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  createConversation,
  getConversation,
  getMostRecentConversation,
  updateConversationTitle,
  addMessage,
  getMessages,
} from "@/lib/conversations";

beforeEach(async () => {
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
});

describe("Chat Lifecycle", () => {
  describe("conversation CRUD", () => {
    it("creates a conversation with default title", async () => {
      const conv = await createConversation();
      expect(conv.title).toBe("");
      expect(conv.id).toBeDefined();
    });

    it("creates a conversation with custom title", async () => {
      const conv = await createConversation("My Chat");
      expect(conv.title).toBe("My Chat");
    });

    it("retrieves a conversation by id", async () => {
      const conv = await createConversation("Test");
      const fetched = await getConversation(conv.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.title).toBe("Test");
    });

    it("returns null for non-existent conversation", async () => {
      const result = await getConversation("non-existent");
      expect(result).toBeNull();
    });

    it("gets most recent conversation", async () => {
      await createConversation("Old");
      const recent = await createConversation("New");
      const result = await getMostRecentConversation();
      expect(result).not.toBeNull();
      expect(result!.id).toBe(recent.id);
    });

    it("updates conversation title", async () => {
      const conv = await createConversation("Old Title");
      await updateConversationTitle(conv.id, "New Title");
      const fetched = await getConversation(conv.id);
      expect(fetched!.title).toBe("New Title");
    });
  });

  describe("messages", () => {
    it("adds a user message", async () => {
      const conv = await createConversation();
      const msg = await addMessage(conv.id, "user", "Hello");
      expect(msg.role).toBe("user");
      expect(msg.content).toBe("Hello");
      expect(msg.conversationId).toBe(conv.id);
      expect(msg.toolCalls).toEqual([]);
    });

    it("adds an assistant message with tool calls", async () => {
      const conv = await createConversation();
      const toolCalls = [
        { name: "semantic_search", input: { query: "test" } },
      ];
      const msg = await addMessage(conv.id, "assistant", "Here's what I found", toolCalls);
      expect(msg.toolCalls).toEqual(toolCalls);
    });

    it("retrieves messages in chronological order", async () => {
      const conv = await createConversation();
      await addMessage(conv.id, "user", "First");
      await addMessage(conv.id, "assistant", "Second");
      await addMessage(conv.id, "user", "Third");

      const messages = await getMessages(conv.id);
      expect(messages).toHaveLength(3);
      expect(messages[0].content).toBe("First");
      expect(messages[1].content).toBe("Second");
      expect(messages[2].content).toBe("Third");
    });

    it("respects message limit", async () => {
      const conv = await createConversation();
      for (let i = 0; i < 5; i++) {
        await addMessage(conv.id, "user", `Message ${i}`);
      }
      const messages = await getMessages(conv.id, 3);
      expect(messages).toHaveLength(3);
      // Should return the 3 most recent in chronological order
      expect(messages[0].content).toBe("Message 2");
      expect(messages[2].content).toBe("Message 4");
    });

    it("adding a message updates conversation updatedAt", async () => {
      const conv = await createConversation();
      const originalUpdatedAt = conv.updatedAt;
      // Small delay to ensure timestamp differs
      await new Promise((r) => setTimeout(r, 10));
      await addMessage(conv.id, "user", "Bump");
      const updated = await getConversation(conv.id);
      expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(
        originalUpdatedAt.getTime()
      );
    });
  });

  describe("conversation deletion cascade", () => {
    it("deleting conversation should clean up messages", async () => {
      const conv = await createConversation();
      await addMessage(conv.id, "user", "Hello");
      await addMessage(conv.id, "assistant", "Hi");

      await prisma.message.deleteMany({ where: { conversationId: conv.id } });
      await prisma.conversation.delete({ where: { id: conv.id } });

      const messages = await prisma.message.findMany({
        where: { conversationId: conv.id },
      });
      expect(messages).toHaveLength(0);
    });
  });
});
