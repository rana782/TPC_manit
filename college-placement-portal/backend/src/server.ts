import app from './app';
import logger from './utils/logger';
import { ensureCompanyProfilesImported } from './services/companyJsonImport.service';
import { ensureSupabaseBaselineSeed } from './services/baselineSeed.service';
import prisma from './lib/prisma';

const PORT = Number(process.env.PORT || 5000);
const HOST = '0.0.0.0';

const baselineLogger = {
    info: (m: string) => logger.info(m),
    warn: (m: string) => logger.warn(m),
    error: (m: string, e?: unknown) => logger.error(e != null ? `${m} ${String(e)}` : m),
};

app.listen(PORT, HOST, () => {
    logger.info(`Server is running on http://${HOST}:${PORT}`);
    void ensureCompanyProfilesImported(prisma)
        .catch((e) => logger.error('ensureCompanyProfilesImported', e))
        .then(() => ensureSupabaseBaselineSeed(prisma, baselineLogger))
        .catch((e) => logger.error('ensureSupabaseBaselineSeed', e));
});
