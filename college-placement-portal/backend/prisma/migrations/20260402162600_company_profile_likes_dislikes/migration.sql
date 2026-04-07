-- Add arrays for JSON-based company intelligence (no scraping).
ALTER TABLE "CompanyProfile"
ADD COLUMN IF NOT EXISTS "highlyRatedFor" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "CompanyProfile"
ADD COLUMN IF NOT EXISTS "criticallyRatedFor" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

