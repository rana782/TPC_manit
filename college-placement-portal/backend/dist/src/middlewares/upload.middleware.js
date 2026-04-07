"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadJobDocs = exports.uploadPhoto = exports.uploadResume = exports.uploadDocument = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const crypto_1 = __importDefault(require("crypto"));
// Ensure upload directory exists (should be consistent with app.ts static serving)
const UPLOAD_DIR = path_1.default.resolve(__dirname, '../../uploads');
if (!fs_1.default.existsSync(UPLOAD_DIR)) {
    fs_1.default.mkdirSync(UPLOAD_DIR, { recursive: true });
}
// Allowed MIME types
const ALLOWED_MIMETYPES = {
    document: ['application/pdf', 'image/jpeg', 'image/png'],
    resume: ['application/pdf'],
    photo: ['image/jpeg', 'image/png', 'image/webp'],
};
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        const randomName = crypto_1.default.randomBytes(16).toString('hex');
        cb(null, `${randomName}${ext}`);
    },
});
function fileFilter(allowedTypes) {
    return (_req, file, cb) => {
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: ${allowedTypes.join(', ')}`));
        }
    };
}
// Upload configs
exports.uploadDocument = (0, multer_1.default)({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter: fileFilter(ALLOWED_MIMETYPES.document),
});
exports.uploadResume = (0, multer_1.default)({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: fileFilter(ALLOWED_MIMETYPES.resume),
});
exports.uploadPhoto = (0, multer_1.default)({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
    fileFilter: fileFilter(ALLOWED_MIMETYPES.photo),
});
exports.uploadJobDocs = (0, multer_1.default)({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit for JNF/JD
    fileFilter: fileFilter(ALLOWED_MIMETYPES.document),
});
