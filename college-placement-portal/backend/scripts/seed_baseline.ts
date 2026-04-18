/**
 * Manual baseline seed against DATABASE_URL (Supabase). Idempotent unless --force.
 *
 *   npm run seed:baseline
 *   npm run seed:baseline -- --force
 */
import '../src/loadEnv';
import { PrismaClient } from '@prisma/client';
import { runSupabaseBaselineSeed } from '../src/services/baselineSeed.service';

async function main() {
    const prisma = new PrismaClient();
    const force = process.argv.includes('--force');
    try {
        await runSupabaseBaselineSeed(prisma, {
            force,
            passwordPlain: process.env.BASELINE_SEED_PASSWORD || 'Pass@123',
            logger: {
                info: (m) => console.log(m),
                warn: (m) => console.warn(m),
                error: (m, e) => console.error(m, e),
            },
        });
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
