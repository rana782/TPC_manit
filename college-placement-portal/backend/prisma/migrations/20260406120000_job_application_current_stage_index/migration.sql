-- JobApplication.currentStageIndex exists in Prisma schema but was missing from historical migrations.
ALTER TABLE "JobApplication" ADD COLUMN "currentStageIndex" INTEGER NOT NULL DEFAULT 0;
