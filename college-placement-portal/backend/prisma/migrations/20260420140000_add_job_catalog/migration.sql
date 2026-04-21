-- CreateTable
CREATE TABLE "JobCatalog" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "externalJobId" TEXT,
    "company" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "jobTitle" TEXT,
    "skillsText" TEXT,
    "skillsArr" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "jobDescription" TEXT,
    "responsibilities" TEXT,
    "experienceText" TEXT,
    "minExperience" INTEGER,
    "maxExperience" INTEGER,
    "workType" TEXT,
    "location" TEXT,
    "country" TEXT,
    "salaryRange" TEXT,
    "preference" TEXT,
    "companySize" INTEGER,
    "benefitsText" TEXT,
    "companyProfileText" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobCatalog_sourceKey_key" ON "JobCatalog"("sourceKey");

-- CreateIndex
CREATE INDEX "JobCatalog_company_idx" ON "JobCatalog"("company");

-- CreateIndex
CREATE INDEX "JobCatalog_role_idx" ON "JobCatalog"("role");

-- CreateIndex
CREATE INDEX "JobCatalog_minExperience_idx" ON "JobCatalog"("minExperience");

-- CreateIndex
CREATE INDEX "JobCatalog_maxExperience_idx" ON "JobCatalog"("maxExperience");

-- CreateIndex
CREATE INDEX "JobCatalog_skillsArr_idx" ON "JobCatalog" USING GIN ("skillsArr");
