-- Module 03: Student Profile Schema Migration
-- Run this manually via: docker exec -i <container_name> psql -U admin -d placement_db < scripts/migrate_module03.sql

-- Add new columns to Student table
ALTER TABLE "Student" 
  ADD COLUMN IF NOT EXISTS branch TEXT,
  ADD COLUMN IF NOT EXISTS course TEXT,
  ADD COLUMN IF NOT EXISTS "scholarNo" TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS dob TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "photoPath" TEXT,
  ADD COLUMN IF NOT EXISTS "tenthPct" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "tenthYear" INTEGER,
  ADD COLUMN IF NOT EXISTS "twelfthPct" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "twelfthYear" INTEGER,
  ADD COLUMN IF NOT EXISTS semester INTEGER,
  ADD COLUMN IF NOT EXISTS sgpa DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS backlogs INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS linkedin TEXT,
  ADD COLUMN IF NOT EXISTS naukri TEXT,
  ADD COLUMN IF NOT EXISTS leetcode TEXT,
  ADD COLUMN IF NOT EXISTS codechef TEXT,
  ADD COLUMN IF NOT EXISTS codeforces TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS pincode TEXT;

-- Drop old columns if they exist (from old schema)
ALTER TABLE "Student" DROP COLUMN IF EXISTS department;
ALTER TABLE "Student" DROP COLUMN IF EXISTS "graduationYear";
ALTER TABLE "Student" DROP COLUMN IF EXISTS "resumeUrl";

-- Add roleName and updatedAt to Resume, rename isDefault -> isActive
ALTER TABLE "Resume" 
  ADD COLUMN IF NOT EXISTS "roleName" TEXT,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) DEFAULT NOW();

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Resume' AND column_name='isDefault') THEN
    ALTER TABLE "Resume" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN DEFAULT true;
    UPDATE "Resume" SET "isActive" = "isDefault";
    ALTER TABLE "Resume" DROP COLUMN "isDefault";
  END IF;
END $$;

-- Add type to StudentDocument
CREATE TYPE IF NOT EXISTS "DocumentType" AS ENUM ('COLLEGE_ID', 'AADHAAR', 'PAN', 'OTHER');
ALTER TABLE "StudentDocument" 
  ADD COLUMN IF NOT EXISTS type "DocumentType" NOT NULL DEFAULT 'OTHER';

-- Create Internship table
CREATE TABLE IF NOT EXISTS "Internship" (
  id TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "studentId" TEXT NOT NULL,
  company TEXT NOT NULL,
  role TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3),
  description TEXT,
  "certPath" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "Internship_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create Certification table
CREATE TABLE IF NOT EXISTS "Certification" (
  id TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "studentId" TEXT NOT NULL,
  title TEXT NOT NULL,
  organization TEXT NOT NULL,
  "issueDate" TIMESTAMP(3) NOT NULL,
  "certPath" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "Certification_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- Add _prisma_migrations entry for this migration
INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (
  gen_random_uuid()::text,
  'module03-manual',
  NOW(),
  'module-03-student-profile',
  NULL, NULL, NOW(), 1
) ON CONFLICT DO NOTHING;
