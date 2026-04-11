-- CreateTable
CREATE TABLE "ThinkBatchItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "customId" TEXT NOT NULL,
    "noteTitle" TEXT NOT NULL DEFAULT '',
    "noteContent" TEXT NOT NULL DEFAULT '',
    "explorationPlan" TEXT NOT NULL DEFAULT '{}',
    "explorerResults" TEXT NOT NULL DEFAULT '[]',
    "knownPeople" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "ThinkBatchItem_batchId_idx" ON "ThinkBatchItem"("batchId");

-- CreateIndex
CREATE INDEX "ThinkBatchItem_noteId_idx" ON "ThinkBatchItem"("noteId");
