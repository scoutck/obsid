-- CreateTable: UserInsight
CREATE TABLE "UserInsight" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "evidence" TEXT NOT NULL DEFAULT '',
    "sourceNoteId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "UserInsight_category_idx" ON "UserInsight"("category");
CREATE INDEX "UserInsight_sourceNoteId_idx" ON "UserInsight"("sourceNoteId");
