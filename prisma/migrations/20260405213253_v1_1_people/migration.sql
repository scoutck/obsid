-- AlterTable
ALTER TABLE "Note" ADD COLUMN "unresolvedPeople" TEXT NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "PersonMeta" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "noteId" TEXT NOT NULL,
    "aliases" TEXT NOT NULL DEFAULT '[]',
    "role" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "PersonMeta_noteId_key" ON "PersonMeta"("noteId");

-- CreateTable
CREATE TABLE "NotePerson" (
    "noteId" TEXT NOT NULL,
    "personNoteId" TEXT NOT NULL,

    PRIMARY KEY ("noteId", "personNoteId")
);
