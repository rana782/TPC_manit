"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const app_1 = __importDefault(require("./app"));
const logger_1 = __importDefault(require("./utils/logger"));
const companyJsonImport_service_1 = require("./services/companyJsonImport.service");
const PORT = process.env.PORT || 5000;
const prisma = new client_1.PrismaClient();
app_1.default.listen(PORT, () => {
    logger_1.default.info(`Server is running on http://localhost:${PORT}`);
    void (0, companyJsonImport_service_1.ensureCompanyProfilesImported)(prisma).catch((e) => logger_1.default.error('ensureCompanyProfilesImported', e));
});
