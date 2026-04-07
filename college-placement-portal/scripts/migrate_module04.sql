-- Module 04: ATS Score Migration
ALTER TABLE "JobApplication" ADD COLUMN IF NOT EXISTS "atsScore" FLOAT;
ALTER TABLE "JobApplication" ADD COLUMN IF NOT EXISTS "atsExplanation" TEXT;
ALTER TABLE "JobApplication" ADD COLUMN IF NOT EXISTS "atsMatchedKeywords" JSONB;
