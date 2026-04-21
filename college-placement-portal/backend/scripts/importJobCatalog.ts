import path from 'path';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { importJobCatalogCsv } from '../src/services/jobCatalogImport.service';

config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function main() {
    const out = await importJobCatalogCsv(prisma, console.log);
    if (out.imported === 0) {
        console.error('[importJobCatalog] No rows imported.');
        process.exitCode = 1;
        return;
    }
    console.log(
        `[importJobCatalog] finished imported=${out.imported} skipped=${out.skipped} csvPath=${out.csvPath}`
    );
}

main()
    .catch((err) => {
        console.error('[importJobCatalog] fatal', err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
