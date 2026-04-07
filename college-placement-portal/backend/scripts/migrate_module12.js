const { Client } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || "postgresql://admin:adminpassword@localhost:5433/placement_db?schema=public";
const client = new Client({ connectionString });

async function run() {
    try {
        await client.connect();
        console.log('Connected to DB, running Module 12 migrations...');

        await client.query(`
            CREATE TABLE IF NOT EXISTS "Alumni" (
                "id"            TEXT        NOT NULL,
                "studentId"     TEXT        NOT NULL,
                "userId"        TEXT        NOT NULL,
                "name"          TEXT        NOT NULL,
                "branch"        TEXT,
                "role"          TEXT        NOT NULL,
                "ctc"           TEXT,
                "placementYear" INTEGER     NOT NULL,
                "linkedinUrl"   TEXT,
                "companyName"   TEXT        NOT NULL,
                "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT "Alumni_pkey" PRIMARY KEY ("id")
            );
        `);
        console.log('Created Alumni table');

        await client.query(`
            ALTER TABLE "Alumni"
            ADD CONSTRAINT IF NOT EXISTS "Alumni_studentId_fkey"
            FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        `).catch(() => console.log('studentId FK already exists (OK)'));

        await client.query(`
            ALTER TABLE "Alumni"
            ADD CONSTRAINT IF NOT EXISTS "Alumni_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        `).catch(() => console.log('userId FK already exists (OK)'));

        // Seed default ATS weights setting if not exists
        const defaultWeights = {
            skillsMatch: 0.4,
            experience: 0.2,
            projects: 0.2,
            certifications: 0.1,
            tools: 0.1
        };
        await client.query(`
            INSERT INTO "SystemSetting" ("key", "value")
            VALUES ('ATS_WEIGHTS', $1)
            ON CONFLICT ("key") DO NOTHING;
        `, [JSON.stringify(defaultWeights)]);
        console.log('Seeded default ATS_WEIGHTS setting');

        console.log('Migration successful!');
    } catch (e) {
        console.error('Migration failed:', e);
    } finally {
        await client.end();
    }
}

run();
