-- CreateTable
CREATE TABLE "NoteThinkTriage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "noteId" TEXT NOT NULL,
    "worthy" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "triagedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "NoteThinkTriage_noteId_key" ON "NoteThinkTriage"("noteId");

-- CreateIndex
CREATE INDEX "NoteThinkTriage_noteId_idx" ON "NoteThinkTriage"("noteId");
