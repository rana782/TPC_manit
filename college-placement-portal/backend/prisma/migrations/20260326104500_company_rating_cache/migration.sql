-- CreateTable
CREATE TABLE "CompanyRating" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "rating" DOUBLE PRECISION,
    "lastUpdated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyRating_companyName_key" ON "CompanyRating"("companyName");

-- Add profile lock boolean and migrate legacy lockType data
ALTER TABLE "ProfileLock" ADD COLUMN "profileLocked" BOOLEAN NOT NULL DEFAULT true;
UPDATE "ProfileLock"
SET "profileLocked" = CASE
    WHEN COALESCE("lockType", '') = '' THEN true
    ELSE true
END;
ALTER TABLE "ProfileLock" DROP COLUMN "lockType";
