const { Client } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || "postgresql://admin:adminpassword@localhost:5433/placement_db?schema=public";

const client = new Client({
    connectionString,
});

async function run() {
    try {
        await client.connect();
        console.log("Connected to DB, running Module 10 migrations...");

        // Create NotificationTemplate table
        await client.query(`
            CREATE TABLE "NotificationTemplate" (
                "id" TEXT NOT NULL,
                "type" TEXT NOT NULL,
                "templateText" TEXT NOT NULL,
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP(3) NOT NULL,

                CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
            );
            CREATE UNIQUE INDEX "NotificationTemplate_type_key" ON "NotificationTemplate"("type");
        `);
        console.log("Created NotificationTemplate table");

        // Create NotificationLog table
        await client.query(`
            CREATE TABLE "NotificationLog" (
                "id" TEXT NOT NULL,
                "userId" TEXT NOT NULL,
                "jobId" TEXT,
                "message" TEXT NOT NULL,
                "channel" TEXT NOT NULL DEFAULT 'WHATSAPP',
                "status" TEXT NOT NULL DEFAULT 'PENDING',
                "sentAt" TIMESTAMP(3),
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

                CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
            );
            ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
            ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        `);
        console.log("Created NotificationLog table");

        // Create SystemSetting table
        await client.query(`
            CREATE TABLE "SystemSetting" (
                "key" TEXT NOT NULL,
                "value" TEXT NOT NULL,

                CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
            );
        `);
        console.log("Created SystemSetting table");

        // Seed basic settings & templates
        await client.query(`
            INSERT INTO "SystemSetting" ("key", "value") VALUES ('WHATSAPP_ENABLED', 'true') ON CONFLICT DO NOTHING;
            
            INSERT INTO "NotificationTemplate" ("id", "type", "templateText", "updatedAt") VALUES 
            (gen_random_uuid()::text, 'APPLICATION_CONFIRMATION', 'Hello {student_name}, your application for {role} at {company_name} has been submitted. We''ll update you about OA/Interview dates. - TPCC', CURRENT_TIMESTAMP),
            (gen_random_uuid()::text, 'OA_SCHEDULED',             'Hello {student_name}, OA for {company_name} ({role}) is scheduled on {date}. Check portal. - TPCC', CURRENT_TIMESTAMP),
            (gen_random_uuid()::text, 'INTERVIEW_SCHEDULED',      'Hello {student_name}, your interview for {company_name} ({role}) is scheduled on {date}. - TPCC', CURRENT_TIMESTAMP),
            (gen_random_uuid()::text, 'RESULT_DECLARED',          'Hello {student_name}, result for {company_name} ({role}) is declared. Your status: {status}. - TPCC', CURRENT_TIMESTAMP)
            ON CONFLICT DO NOTHING;
        `);
        console.log("Seeded basic settings & templates");

        console.log("Migration successful!");
    } catch (e) {
        console.error("Migration failed:", e);
    } finally {
        await client.end();
    }
}

run();
