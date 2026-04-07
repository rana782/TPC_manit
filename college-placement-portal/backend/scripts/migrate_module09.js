const { Client } = require('pg');
require('dotenv').config(); // Load .env from backend folder where script is run

const connectionString = process.env.DATABASE_URL || "postgresql://admin:adminpassword@localhost:5433/placement_db?schema=public";

const client = new Client({
    connectionString,
});

async function run() {
    try {
        await client.connect();
        console.log("Connected to DB, running Module 09 migrations...");

        // 1. Alter User table
        await client.query(`
            ALTER TABLE "User" 
            ADD COLUMN "verifiedById" TEXT,
            ADD COLUMN "verifiedAt" TIMESTAMP(3),
            ADD COLUMN "permJobCreate" BOOLEAN NOT NULL DEFAULT false,
            ADD COLUMN "permLockProfile" BOOLEAN NOT NULL DEFAULT false,
            ADD COLUMN "permExportCsv" BOOLEAN NOT NULL DEFAULT false;
        `);
        console.log("Added columns to User table");

        // Add foreign key for verifiedById
        await client.query(`
            ALTER TABLE "User" ADD CONSTRAINT "User_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        `);
        console.log("Added foreign key to User table");

        // 2. Create ActionOverride table
        await client.query(`
            CREATE TABLE "ActionOverride" (
                "id" TEXT NOT NULL,
                "coordinatorId" TEXT NOT NULL,
                "spocId" TEXT NOT NULL,
                "actionType" TEXT NOT NULL,
                "entity" TEXT NOT NULL,
                "entityId" TEXT NOT NULL,
                "originalValue" JSONB,
                "overriddenValue" JSONB,
                "reason" TEXT,
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

                CONSTRAINT "ActionOverride_pkey" PRIMARY KEY ("id")
            );
        `);
        console.log("Created ActionOverride table");

        // 3. Add foreign keys for ActionOverride
        await client.query(`
            ALTER TABLE "ActionOverride" ADD CONSTRAINT "ActionOverride_coordinatorId_fkey" FOREIGN KEY ("coordinatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
            ALTER TABLE "ActionOverride" ADD CONSTRAINT "ActionOverride_spocId_fkey" FOREIGN KEY ("spocId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        `);
        console.log("Added foreign keys for ActionOverride");

        console.log("Migration successful!");
    } catch (e) {
        if (e.message.includes('already exists') || e.message.includes('column "verifiedById" of relation "User" already exists')) {
            console.log("Migration already applied or partial failure.");
        } else {
            console.error("Migration failed:", e);
        }
    } finally {
        await client.end();
    }
}

run();
