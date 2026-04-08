/**
 * Run only the permanent demo cohort (50 students, 20 jobs, 100 alumni) without full prisma seed.
 * Safe to run multiple times (idempotent).
 */
import '../src/loadEnv';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { seedPermanentDemo } from '../prisma/seedPermanentDemo';

const DEFAULT_PASS = 'Pass@123';

async function main() {
    const prisma = new PrismaClient();
    const passwordHash = await bcrypt.hash(DEFAULT_PASS, 10);
    await seedPermanentDemo(prisma, passwordHash);
    await prisma.$disconnect();
    console.log(`Password for new demo users (if created): ${DEFAULT_PASS}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
