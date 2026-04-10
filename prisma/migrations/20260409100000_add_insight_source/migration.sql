-- AlterTable
ALTER TABLE "UserInsight" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'organize';

-- CreateIndex
CREATE INDEX "UserInsight_source_idx" ON "UserInsight"("source");
