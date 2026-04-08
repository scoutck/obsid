-- CreateTable: Task
CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "dueDate" DATETIME,
    "noteId" TEXT,
    "personNoteId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "Task_noteId_idx" ON "Task"("noteId");
CREATE INDEX "Task_personNoteId_idx" ON "Task"("personNoteId");
CREATE INDEX "Task_completed_idx" ON "Task"("completed");
