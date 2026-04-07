import { PrismaClient } from '@prisma/client';
import app from './app';
import logger from './utils/logger';
import { ensureCompanyProfilesImported } from './services/companyJsonImport.service';

const PORT = process.env.PORT || 5000;
const prisma = new PrismaClient();

app.listen(PORT, () => {
    logger.info(`Server is running on http://localhost:${PORT}`);
    void ensureCompanyProfilesImported(prisma).catch((e) => logger.error('ensureCompanyProfilesImported', e));
});
