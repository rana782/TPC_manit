const { Client } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || "postgresql://admin:adminpassword@localhost:5433/placement_db?schema=public";
const client = new Client({ connectionString });

async function run() {
    try {
        await client.connect();
        console.log('Connected to DB, running Module 11 migrations...');

        await client.query(`
            CREATE TABLE IF NOT EXISTS "PlacementAnnouncementLog" (
                "id"             TEXT        NOT NULL,
                "jobId"          TEXT,
                "companyName"    TEXT        NOT NULL,
                "placementYear"  INTEGER     NOT NULL,
                "postedByUserId" TEXT        NOT NULL,
                "zapStatus"      TEXT        NOT NULL DEFAULT 'MOCKED',
                "responseBody"   TEXT,
                "payload"        JSONB       NOT NULL,
                "postedAt"       TIMESTAMP(3),
                "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT "PlacementAnnouncementLog_pkey" PRIMARY KEY ("id")
            );
        `);
        console.log('Created PlacementAnnouncementLog table');

        await client.query(`
            ALTER TABLE "PlacementAnnouncementLog"
            ADD CONSTRAINT IF NOT EXISTS "PlacementAnnouncementLog_jobId_fkey"
            FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        `).catch(() => console.log('jobId FK already exists or failed (OK)'));

        await client.query(`
            ALTER TABLE "PlacementAnnouncementLog"
            ADD CONSTRAINT IF NOT EXISTS "PlacementAnnouncementLog_postedByUserId_fkey"
            FOREIGN KEY ("postedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        `).catch(() => console.log('postedByUserId FK already exists or failed (OK)'));

        // Seed the LinkedIn setting
        await client.query(`
            INSERT INTO "SystemSetting" ("key", "value")
            VALUES ('ZAPIER_LINKEDIN_ENABLED', 'false')
            ON CONFLICT DO NOTHING;
        `);
        console.log('Seeded ZAPIER_LINKEDIN_ENABLED setting');

        console.log('Migration successful!');
    } catch (e) {
        console.error('Migration failed:', e);
    } finally {
        await client.end();
    }
}

run();
