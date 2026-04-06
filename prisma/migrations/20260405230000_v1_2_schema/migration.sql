-- CreateTable: Embedding
CREATE TABLE "Embedding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "noteId" TEXT NOT NULL,
    "vector" BLOB NOT NULL,
    "model" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "Embedding_noteId_key" ON "Embedding"("noteId");

-- CreateTable: Conversation
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable: Message
CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "toolCalls" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Message_conversationId_idx" ON "Message"("conversationId");

-- CreateTable: PendingPerson
CREATE TABLE "PendingPerson" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "sourceNoteId" TEXT,
    "sourceConversationId" TEXT,
    "context" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- AlterTable: PersonMeta — add summary and userContext
ALTER TABLE "PersonMeta" ADD COLUMN "summary" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PersonMeta" ADD COLUMN "userContext" TEXT NOT NULL DEFAULT '';

-- AlterTable: NotePerson — add highlight
ALTER TABLE "NotePerson" ADD COLUMN "highlight" TEXT NOT NULL DEFAULT '';
