"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyWithResume = exports.deleteResume = exports.listResumes = exports.uploadResume = void 0;
const client_1 = require("@prisma/client");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const prisma = new client_1.PrismaClient();
const uploadResume = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId)
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded or invalid file format' });
        }
        const student = yield prisma.student.findUnique({ where: { userId } });
        if (!student) {
            fs_1.default.unlinkSync(req.file.path); // clean up orphaned upload
            return res.status(404).json({ success: false, message: 'Student profile not found. Please create one first.' });
        }
        const fileUrl = `/uploads/${req.file.filename}`;
        const resume = yield prisma.resume.create({
            data: {
                studentId: student.id,
                fileName: req.file.originalname,
                fileUrl,
                isActive: true
            }
        });
        res.json({ success: true, resume });
    }
    catch (error) {
        console.error(error);
        if (req.file)
            fs_1.default.unlinkSync(req.file.path); // Clean up if DB insert failed
        res.status(500).json({ success: false, message: 'Failed to upload resume' });
    }
});
exports.uploadResume = uploadResume;
const listResumes = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId)
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        const student = yield prisma.student.findUnique({ where: { userId } });
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student profile not found' });
        }
        const resumes = yield prisma.resume.findMany({
            where: { studentId: student.id },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ success: true, resumes });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to list resumes' });
    }
});
exports.listResumes = listResumes;
const deleteResume = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId)
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        const { id } = req.params;
        const student = yield prisma.student.findUnique({ where: { userId } });
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student profile not found' });
        }
        const resume = yield prisma.resume.findFirst({
            where: { id, studentId: student.id }
        });
        if (!resume) {
            return res.status(404).json({ success: false, message: 'Resume not found' });
        }
        // Proceed to delete from db
        yield prisma.resume.delete({ where: { id: resume.id } });
        // Proceed to delete file from disk securely
        try {
            const filePath = path_1.default.join(__dirname, '../../', resume.fileUrl);
            if (fs_1.default.existsSync(filePath)) {
                fs_1.default.unlinkSync(filePath);
            }
        }
        catch (fsErr) {
            console.error("Failed to delete file from disk:", fsErr);
            // non-blocking
        }
        res.json({ success: true, message: 'Resume deleted successfully' });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Failed to delete resume' });
    }
});
exports.deleteResume = deleteResume;
const applyWithResume = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    return res.status(410).json({
        success: false,
        message: 'This legacy endpoint is disabled. Use POST /api/applications for the ATS-safe apply flow.'
    });
});
exports.applyWithResume = applyWithResume;
