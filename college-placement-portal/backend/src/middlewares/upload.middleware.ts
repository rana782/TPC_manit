import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { Request } from 'express';

// Ensure upload directory exists (should be consistent with app.ts static serving)
const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Allowed MIME types
const ALLOWED_MIMETYPES: Record<string, string[]> = {
    document: ['application/pdf', 'image/jpeg', 'image/png'],
    resume: ['application/pdf'],
    photo: ['image/jpeg', 'image/png', 'image/webp'],
    shortlist: ['text/csv', 'application/csv', 'text/plain'],
};

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const randomName = crypto.randomBytes(16).toString('hex');
        cb(null, `${randomName}${ext}`);
    },
});

function fileFilter(allowedTypes: string[]) {
    return (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        const resumePdfOctet =
            allowedTypes.includes('application/pdf') &&
            file.mimetype === 'application/octet-stream' &&
            ext === '.pdf';
        if (allowedTypes.includes(file.mimetype) || resumePdfOctet) {
            cb(null, true);
        } else {
            cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: ${allowedTypes.join(', ')}`));
        }
    };
}

// Upload configs
export const uploadDocument = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter: fileFilter(ALLOWED_MIMETYPES.document),
});

export const uploadResume = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: fileFilter(ALLOWED_MIMETYPES.resume),
});

export const uploadPhoto = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
    fileFilter: fileFilter(ALLOWED_MIMETYPES.photo),
});

export const uploadJobDocs = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit for JNF/JD
    fileFilter: fileFilter(ALLOWED_MIMETYPES.document),
});

export const uploadShortlist = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: fileFilter(ALLOWED_MIMETYPES.shortlist),
});
