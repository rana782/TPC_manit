-- Add company sector classification field for recommendation cards
ALTER TABLE "JobCatalog"
ADD COLUMN "companySector" TEXT;

CREATE INDEX "JobCatalog_companySector_idx" ON "JobCatalog"("companySector");
