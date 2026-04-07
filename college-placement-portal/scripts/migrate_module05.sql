-- Module 05: Job Posting Schema Updates
-- Note: 'title', 'company', 'deadline' data gets preserved under new names.

ALTER TABLE "Job" RENAME COLUMN "title" TO "role";
ALTER TABLE "Job" RENAME COLUMN "company" TO "companyName";
ALTER TABLE "Job" RENAME COLUMN "deadline" TO "applicationDeadline";

-- Set defaults for JSON columns to avoid null issues during conversion
ALTER TABLE "Job" ALTER COLUMN "requiredProfileFields" SET DEFAULT '[]'::jsonb;

ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "jobType" TEXT NOT NULL DEFAULT 'Full-Time';
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "ctc" TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "jdPath" TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "jnfPath" TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "eligibleBranches" JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "cgpaMin" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "customQuestions" JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "blockPlaced" BOOLEAN NOT NULL DEFAULT true;

-- Enum JobStatus creation (safe generic mapping)
DO $$ BEGIN
    CREATE TYPE "JobStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "status" "JobStatus" NOT NULL DEFAULT 'DRAFT';
