import app from './app';
import logger from './utils/logger';
import { ensureCompanyProfilesImported } from './services/companyJsonImport.service';
import { ensureSupabaseBaselineSeed } from './services/baselineSeed.service';
import prisma from './lib/prisma';

const PORT = process.env.PORT || 5000;

const baselineLogger = {
    info: (m: string) => logger.info(m),
    warn: (m: string) => logger.warn(m),
    error: (m: string, e?: unknown) => logger.error(e != null ? `${m} ${String(e)}` : m),
};

app.listen(PORT, () => {
    logger.info(`Server is running on http://localhost:${PORT}`);
    void ensureCompanyProfilesImported(prisma)
        .catch((e) => logger.error('ensureCompanyProfilesImported', e))
        .then(() => ensureSupabaseBaselineSeed(prisma, baselineLogger))
        .catch((e) => logger.error('ensureSupabaseBaselineSeed', e));
});
