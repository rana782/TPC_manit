"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("./loadEnv");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const logger_1 = __importDefault(require("./utils/logger"));
const errorMiddleware_1 = require("./middlewares/errorMiddleware");
const app = (0, express_1.default)();
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const student_routes_1 = __importDefault(require("./routes/student.routes"));
const resume_routes_1 = __importDefault(require("./routes/resume.routes"));
const job_routes_1 = __importDefault(require("./routes/job.routes"));
const application_routes_1 = __importDefault(require("./routes/application.routes"));
const profileLock_routes_1 = __importDefault(require("./routes/profileLock.routes"));
const admin_routes_1 = __importDefault(require("./routes/admin.routes"));
const notification_routes_1 = __importDefault(require("./routes/notification.routes"));
const announcement_routes_1 = __importDefault(require("./routes/announcement.routes"));
const analytics_routes_1 = __importDefault(require("./routes/analytics.routes"));
const alumni_routes_1 = __importStar(require("./routes/alumni.routes"));
const ats_routes_1 = __importDefault(require("./routes/ats.routes"));
const seed_routes_1 = __importDefault(require("./routes/seed.routes"));
const companyRating_routes_1 = __importDefault(require("./routes/companyRating.routes"));
const companyProfile_routes_1 = __importDefault(require("./routes/companyProfile.routes"));
const path_1 = __importDefault(require("path"));
const env_1 = require("./utils/env");
app.get('/api/health', (req, res) => {
    var _a;
    logger_1.default.info('Health check accessed');
    const llmKey = Boolean((0, env_1.getAtsLlmApiKey)());
    res.json({
        success: true,
        data: {
            service: 'College Placement Portal API',
            status: 'Healthy',
            /** @deprecated use atsLlmConfigured — key is for OpenRouter/Qwen or OpenAI-compatible API */
            openaiConfigured: llmKey,
            atsLlmConfigured: llmKey,
            atsLlmBaseUrl: (_a = (0, env_1.getAtsLlmBaseUrl)()) !== null && _a !== void 0 ? _a : null,
            /** Resolved ATS chat model (default Qwen on OpenRouter). */
            atsLlmModel: (0, env_1.getAtsChatModel)(),
            /** Ordered fallback chain used when provider errors occur for a model. */
            atsLlmModelCandidates: (0, env_1.getAtsChatModelCandidates)(),
        },
    });
});
app.use('/api/auth', auth_routes_1.default);
app.use('/api/student', student_routes_1.default);
app.use('/api/resumes', resume_routes_1.default);
app.use('/api/jobs', job_routes_1.default);
app.use('/api/applications', application_routes_1.default);
app.use('/api/profile-lock', profileLock_routes_1.default);
app.use('/api/admin', admin_routes_1.default);
app.use('/api/notifications', notification_routes_1.default);
app.use('/api/announcements', announcement_routes_1.default);
app.use('/api/analytics', analytics_routes_1.default);
app.use('/api/alumni', alumni_routes_1.default);
app.use('/api/export', alumni_routes_1.exportRouter);
app.use('/api/ats', ats_routes_1.default);
app.use('/api/seed', seed_routes_1.default);
app.use('/api/company-rating', companyRating_routes_1.default);
app.use('/api/companies', companyProfile_routes_1.default);
// Serve uploads directory publicly
// Must match the directory multer writes files into
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '../uploads')));
app.use(errorMiddleware_1.errorMiddleware);
exports.default = app;
