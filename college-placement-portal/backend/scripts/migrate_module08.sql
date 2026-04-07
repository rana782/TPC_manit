-- Module 08 Profile Locking and Placement Records

-- Update PlacementRecord Table
ALTER TABLE "PlacementRecord" DROP CONSTRAINT "PlacementRecord_jobId_fkey";
ALTER TABLE "PlacementRecord" ALTER COLUMN "jobId" DROP NOT NULL;
ALTER TABLE "PlacementRecord" ADD COLUMN "companyName" TEXT;
ALTER TABLE "PlacementRecord" ADD COLUMN "role" TEXT;
ALTER TABLE "PlacementRecord" ADD COLUMN "placementMode" "PlacementType" NOT NULL DEFAULT 'ON_CAMPUS';
ALTER TABLE "PlacementRecord" ADD COLUMN "createdBySpocId" TEXT;

-- For existing records
UPDATE "PlacementRecord" SET "companyName" = 'Unknown Company', "role" = 'Unknown Role' WHERE "companyName" IS NULL;

-- Make fields NOT NULL again if needed
ALTER TABLE "PlacementRecord" ALTER COLUMN "companyName" SET NOT NULL;
ALTER TABLE "PlacementRecord" ALTER COLUMN "role" SET NOT NULL;

ALTER TABLE "PlacementRecord" ADD CONSTRAINT "PlacementRecord_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlacementRecord" ADD CONSTRAINT "PlacementRecord_createdBySpocId_fkey" FOREIGN KEY ("createdBySpocId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create LockType Enum
CREATE TYPE "LockType" AS ENUM ('PLACED_ON_CAMPUS', 'DEBARRED');

-- Create ProfileLock Table
CREATE TABLE "ProfileLock" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "lockType" "LockType" NOT NULL DEFAULT 'PLACED_ON_CAMPUS',
    "lockedById" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "unlockedById" TEXT,
    "unlockedAt" TIMESTAMP(3),

    CONSTRAINT "ProfileLock_pkey" PRIMARY KEY ("id")
);

-- ProfileLock Constraints
ALTER TABLE "ProfileLock" ADD CONSTRAINT "ProfileLock_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfileLock" ADD CONSTRAINT "ProfileLock_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfileLock" ADD CONSTRAINT "ProfileLock_unlockedById_fkey" FOREIGN KEY ("unlockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
