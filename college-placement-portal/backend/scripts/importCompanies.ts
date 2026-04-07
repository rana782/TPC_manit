import { PrismaClient } from '@prisma/client';
import { importCompanyProfilesFromJson } from '../src/services/companyJsonImport.service';

const prisma = new PrismaClient();

async function main() {
  const { ok, skipped } = await importCompanyProfilesFromJson(prisma, console.log);
  if (ok === 0) {
    console.error('[importCompanies] No rows imported. Check backend/data/companies.json exists.');
    process.exitCode = 1;
  } else {
    console.log(`[importCompanies] finished ok=${ok} skipped=${skipped}`);
  }
}

main()
  .catch((err) => {
    console.error('[importCompanies] fatal', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
