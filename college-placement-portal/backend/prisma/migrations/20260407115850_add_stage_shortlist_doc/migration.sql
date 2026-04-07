-- AlterTable
ALTER TABLE "JobApplication" ALTER COLUMN "semanticScore" DROP NOT NULL,
ALTER COLUMN "skillScore" DROP NOT NULL,
ALTER COLUMN "suggestions" DROP NOT NULL;

-- AlterTable
ALTER TABLE "JobStage" ADD COLUMN     "shortlistDocPath" TEXT;
