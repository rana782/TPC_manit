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
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCertification = exports.addCertification = exports.deleteInternship = exports.addInternship = exports.uploadDocument = exports.setResumeActive = exports.deleteResume = exports.getResumes = exports.uploadResume = exports.uploadPhoto = exports.updateProfile = exports.getProfile = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const prisma = new client_1.PrismaClient();
const BRANCH_OPTIONS = ['CSE', 'ECE', 'MDS', 'EE', 'Mech', 'Civil', 'MME', 'Chem'];
const COURSE_OPTIONS = ['BTech', 'MTech', 'MCA', 'Dual Degree'];
const currentYear = new Date().getFullYear();
// Profile update schema
const profileSchema = zod_1.z.object({
    firstName: zod_1.z.string().min(1).optional(),
    lastName: zod_1.z.string().min(1).optional(),
    branch: zod_1.z.union([zod_1.z.enum(BRANCH_OPTIONS), zod_1.z.literal('')]).optional(),
    course: zod_1.z.union([zod_1.z.enum(COURSE_OPTIONS), zod_1.z.literal('')]).optional(),
    scholarNo: zod_1.z.string().regex(/^[0-9]{10}$/, 'Scholar number must contain exactly 10 digits').optional().or(zod_1.z.literal('')),
    phone: zod_1.z.string().optional(),
    dob: zod_1.z.string().optional(), // ISO date string
    // Academic
    tenthPct: zod_1.z.number().min(0, 'Percentage must be between 0 and 100').max(100, 'Percentage must be between 0 and 100').optional(),
    tenthYear: zod_1.z.number().int().optional(),
    twelfthPct: zod_1.z.number().min(0, 'Percentage must be between 0 and 100').max(100, 'Percentage must be between 0 and 100').optional(),
    twelfthYear: zod_1.z.number().int().optional(),
    semester: zod_1.z.number().int().min(1, 'Current semester must be between 1 and 10').max(10, 'Current semester must be between 1 and 10').optional(),
    cgpa: zod_1.z.number().min(0, 'CGPA must be between 0 and 10').max(10, 'CGPA must be between 0 and 10').optional(),
    sgpa: zod_1.z.number().min(0, 'SGPA must be between 0 and 10').max(10, 'SGPA must be between 0 and 10').optional(),
    backlogs: zod_1.z.number().int().min(0).max(50).optional(),
    // Links
    linkedin: zod_1.z.string().url().optional().or(zod_1.z.literal('')),
    naukri: zod_1.z.string().url().optional().or(zod_1.z.literal('')),
    leetcode: zod_1.z.string().url().optional().or(zod_1.z.literal('')),
    codechef: zod_1.z.string().url().optional().or(zod_1.z.literal('')),
    codeforces: zod_1.z.string().url().optional().or(zod_1.z.literal('')),
    // Address
    address: zod_1.z.string().optional(),
    city: zod_1.z.string().optional(),
    state: zod_1.z.string().optional(),
    pincode: zod_1.z.string().regex(/^[0-9]{6}$/, 'Pincode must be a 6 digit number').optional().or(zod_1.z.literal('')),
})
    .refine((data) => {
    const tenth = data.tenthYear;
    const twelfth = data.twelfthYear;
    if (tenth == null || twelfth == null)
        return true;
    return tenth < currentYear && twelfth < currentYear;
}, { message: 'Year cannot be in the future' })
    .refine((data) => {
    const tenth = data.tenthYear;
    const twelfth = data.twelfthYear;
    if (tenth == null || twelfth == null)
        return true;
    return twelfth - tenth >= 2;
}, { message: 'Gap between 10th and 12th must be at least 2 years' });
const internshipSchema = zod_1.z.object({
    company: zod_1.z.string().min(1),
    role: zod_1.z.string().min(1),
    startDate: zod_1.z.string(),
    endDate: zod_1.z.string().optional(),
    description: zod_1.z.string().optional(),
}).refine((data) => {
    if (!data.endDate || !data.startDate)
        return true;
    return new Date(data.endDate) > new Date(data.startDate);
}, { message: 'Internship end date must be after start date', path: ['endDate'] });
const certificationSchema = zod_1.z.object({
    title: zod_1.z.string().min(1),
    organization: zod_1.z.string().min(1),
    issueDate: zod_1.z.string(),
});
// GET /api/student/profile
const getProfile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }
        const student = yield prisma.student.findUnique({
            where: { userId },
            include: {
                internships: true,
                certifications: true,
                resumes: { where: { isActive: true }, orderBy: { createdAt: 'desc' } },
                documents: true,
            },
        });
        if (!student) {
            res.status(404).json({ success: false, message: 'Profile not found' });
            return;
        }
        res.json({ success: true, data: student });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
exports.getProfile = getProfile;
// PUT /api/student/profile
const updateProfile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }
        const parsed = profileSchema.safeParse(req.body);
        if (!parsed.success) {
            const firstError = ((_b = parsed.error.errors[0]) === null || _b === void 0 ? void 0 : _b.message) || 'Validation error';
            res.status(400).json({ success: false, error: 'Validation error', message: firstError });
            return;
        }
        const data = parsed.data;
        const updateData = Object.assign({}, data);
        if (data.dob)
            updateData.dob = new Date(data.dob);
        const student = yield prisma.student.update({
            where: { userId },
            data: updateData,
        });
        res.json({ success: true, data: student });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
exports.updateProfile = updateProfile;
// POST /api/student/photo  (multipart/form-data with field "photo")
const uploadPhoto = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }
        if (!req.file) {
            res.status(400).json({ success: false, message: 'No file uploaded' });
            return;
        }
        const photoPath = `/uploads/${req.file.filename}`;
        const student = yield prisma.student.update({
            where: { userId },
            data: { photoPath },
        });
        res.json({ success: true, data: { photoPath: student.photoPath } });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
exports.uploadPhoto = uploadPhoto;
// POST /api/student/resume  (multipart with field "resume")
const uploadResume = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }
        if (!req.file) {
            res.status(400).json({ success: false, message: 'No file uploaded' });
            return;
        }
        const student = yield prisma.student.findUnique({ where: { userId } });
        if (!student) {
            res.status(404).json({ success: false, message: 'Student profile not found' });
            return;
        }
        const roleName = req.body.roleName || 'General';
        const fileUrl = `/uploads/${req.file.filename}`;
        const resume = yield prisma.resume.create({
            data: {
                studentId: student.id,
                roleName,
                fileName: req.file.originalname,
                fileUrl,
                isActive: true,
            },
        });
        res.status(201).json({ success: true, data: resume });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
exports.uploadResume = uploadResume;
// GET /api/student/resumes
const getResumes = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }
        const student = yield prisma.student.findUnique({ where: { userId } });
        if (!student) {
            res.status(404).json({ success: false, message: 'Profile not found' });
            return;
        }
        const resumes = yield prisma.resume.findMany({
            where: { studentId: student.id },
            orderBy: { createdAt: 'desc' },
        });
        res.json({ success: true, data: resumes });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
exports.getResumes = getResumes;
// DELETE /api/student/resume/:id
const deleteResume = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }
        const student = yield prisma.student.findUnique({ where: { userId } });
        if (!student) {
            res.status(404).json({ success: false, message: 'Profile not found' });
            return;
        }
        const resume = yield prisma.resume.findFirst({
            where: { id: req.params.id, studentId: student.id },
        });
        if (!resume) {
            res.status(404).json({ success: false, message: 'Resume not found' });
            return;
        }
        yield prisma.resume.delete({ where: { id: resume.id } });
        res.json({ success: true, message: 'Resume deleted' });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
exports.deleteResume = deleteResume;
// PUT /api/student/resume/:id/active  — toggle active state
const setResumeActive = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }
        const student = yield prisma.student.findUnique({ where: { userId } });
        if (!student) {
            res.status(404).json({ success: false, message: 'Profile not found' });
            return;
        }
        const resume = yield prisma.resume.findFirst({
            where: { id: req.params.id, studentId: student.id },
        });
        if (!resume) {
            res.status(404).json({ success: false, message: 'Resume not found' });
            return;
        }
        const updated = yield prisma.resume.update({
            where: { id: resume.id },
            data: { isActive: !resume.isActive },
        });
        res.json({ success: true, data: updated });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
exports.setResumeActive = setResumeActive;
// POST /api/student/document  (multipart with field "document", query ?type=AADHAAR)
const uploadDocument = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }
        if (!req.file) {
            res.status(400).json({ success: false, message: 'No file uploaded' });
            return;
        }
        const student = yield prisma.student.findUnique({ where: { userId } });
        if (!student) {
            res.status(404).json({ success: false, message: 'Profile not found' });
            return;
        }
        const validTypes = ['COLLEGE_ID', 'AADHAAR', 'PAN', 'OTHER'];
        const docType = (req.body.type || 'OTHER').toUpperCase();
        if (!validTypes.includes(docType)) {
            res.status(400).json({ success: false, message: `Invalid doc type. Use: ${validTypes.join(', ')}` });
            return;
        }
        const doc = yield prisma.studentDocument.create({
            data: {
                studentId: student.id,
                type: docType,
                fileName: req.file.originalname,
                fileUrl: `/uploads/${req.file.filename}`,
            },
        });
        res.status(201).json({ success: true, data: doc });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
exports.uploadDocument = uploadDocument;
// POST /api/student/internships
const addInternship = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }
        const student = yield prisma.student.findUnique({ where: { userId } });
        if (!student) {
            res.status(404).json({ success: false, message: 'Profile not found' });
            return;
        }
        const parsed = internshipSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ success: false, message: parsed.error.errors[0].message });
            return;
        }
        const { company, role, startDate, endDate, description } = parsed.data;
        const intern = yield prisma.internship.create({
            data: {
                studentId: student.id,
                company,
                role,
                startDate: new Date(startDate),
                endDate: endDate ? new Date(endDate) : null,
                description,
            },
        });
        res.status(201).json({ success: true, data: intern });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
exports.addInternship = addInternship;
// DELETE /api/student/internships/:id
const deleteInternship = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }
        const student = yield prisma.student.findUnique({ where: { userId } });
        if (!student) {
            res.status(404).json({ success: false, message: 'Profile not found' });
            return;
        }
        const intern = yield prisma.internship.findFirst({ where: { id: req.params.id, studentId: student.id } });
        if (!intern) {
            res.status(404).json({ success: false, message: 'Internship not found' });
            return;
        }
        yield prisma.internship.delete({ where: { id: intern.id } });
        res.json({ success: true, message: 'Internship deleted' });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
exports.deleteInternship = deleteInternship;
// POST /api/student/certifications
const addCertification = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }
        const student = yield prisma.student.findUnique({ where: { userId } });
        if (!student) {
            res.status(404).json({ success: false, message: 'Profile not found' });
            return;
        }
        const parsed = certificationSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ success: false, message: parsed.error.errors[0].message });
            return;
        }
        const { title, organization, issueDate } = parsed.data;
        const cert = yield prisma.certification.create({
            data: { studentId: student.id, title, organization, issueDate: new Date(issueDate) },
        });
        res.status(201).json({ success: true, data: cert });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
exports.addCertification = addCertification;
// DELETE /api/student/certifications/:id
const deleteCertification = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }
        const student = yield prisma.student.findUnique({ where: { userId } });
        if (!student) {
            res.status(404).json({ success: false, message: 'Profile not found' });
            return;
        }
        const cert = yield prisma.certification.findFirst({ where: { id: req.params.id, studentId: student.id } });
        if (!cert) {
            res.status(404).json({ success: false, message: 'Certification not found' });
            return;
        }
        yield prisma.certification.delete({ where: { id: cert.id } });
        res.json({ success: true, message: 'Certification deleted' });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
exports.deleteCertification = deleteCertification;
