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
exports.getPlacementTrends = exports.exportAnalyticsCsv = exports.getByBranch = exports.getByCompany = exports.getByYear = exports.getCompanyHistory = exports.getBranchComparison = exports.getSummary = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
// GET /api/dashboard/summary
const getSummary = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const [totalStudents, totalJobs, totalApplications, totalPlaced] = yield Promise.all([
            prisma.student.count(),
            prisma.job.count(),
            prisma.jobApplication.count(),
            prisma.placementRecord.count()
        ]);
        return res.json({ success: true, summary: { totalStudents, totalJobs, totalApplications, totalPlaced } });
    }
    catch (e) {
        return res.status(500).json({ success: false, message: 'Failed to fetch summary metrics.' });
    }
});
exports.getSummary = getSummary;
// GET /api/dashboard/branch-comparison
const getBranchComparison = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { from, to } = req.query;
        let placementYearFilter = {};
        if (from || to) {
            placementYearFilter = {
                placementYear: Object.assign(Object.assign({}, (from ? { gte: parseInt(from) } : {})), (to ? { lte: parseInt(to) } : {}))
            };
        }
        const alumni = yield prisma.alumni.findMany({
            where: placementYearFilter,
            select: { branch: true, ctc: true }
        });
        const branchStats = {};
        alumni.forEach(a => {
            const b = a.branch || 'Unknown';
            if (!branchStats[b])
                branchStats[b] = { count: 0, totalCtc: 0, parsedCtcs: 0 };
            branchStats[b].count += 1;
            // Extract numeric CTC if possible (e.g. from "12 LPA", "10.5")
            if (a.ctc) {
                const num = parseFloat(a.ctc.replace(/[^0-9.]/g, ''));
                if (!isNaN(num)) {
                    branchStats[b].totalCtc += num;
                    branchStats[b].parsedCtcs += 1;
                }
            }
        });
        const result = Object.entries(branchStats).map(([branch, stats]) => ({
            branch,
            placementCount: stats.count,
            avgCtc: stats.parsedCtcs > 0 ? (stats.totalCtc / stats.parsedCtcs).toFixed(2) : '0'
        }));
        return res.json({ success: true, data: result });
    }
    catch (e) {
        return res.status(500).json({ success: false, message: 'Failed to fetch branch comparison.' });
    }
});
exports.getBranchComparison = getBranchComparison;
// GET /api/dashboard/company-history/:companyName
const getCompanyHistory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { companyName } = req.params;
        const result = yield prisma.alumni.groupBy({
            by: ['placementYear'],
            where: { companyName },
            _count: { studentId: true },
            orderBy: { placementYear: 'asc' }
        });
        const formatted = result.map(r => ({
            year: r.placementYear,
            placements: r._count.studentId
        }));
        return res.json({ success: true, companyName, data: formatted });
    }
    catch (e) {
        return res.status(500).json({ success: false, message: 'Failed to fetch company history.' });
    }
});
exports.getCompanyHistory = getCompanyHistory;
// GET /api/analytics/by-year  – alumni grouped by placementYear
const getByYear = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const records = yield prisma.alumni.groupBy({
            by: ['placementYear'],
            _count: { studentId: true },
            orderBy: { placementYear: 'asc' }
        });
        const data = records.map(r => ({ year: r.placementYear, count: r._count.studentId }));
        return res.json({ success: true, data });
    }
    catch (e) {
        return res.status(500).json({ success: false, message: 'Failed to fetch by-year data.' });
    }
});
exports.getByYear = getByYear;
// GET /api/analytics/by-company?limit=10  – top companies by accepted applications
const getByCompany = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const limit = parseInt(req.query.limit || '10');
        const jobs = yield prisma.job.findMany({
            include: { applications: { where: { status: 'ACCEPTED' }, select: { id: true } } },
            orderBy: { createdAt: 'desc' }
        });
        const data = jobs
            .map(j => ({ company: j.companyName, title: j.role, acceptedCount: j.applications.length }))
            .filter(j => j.acceptedCount > 0)
            .sort((a, b) => b.acceptedCount - a.acceptedCount)
            .slice(0, limit);
        return res.json({ success: true, data });
    }
    catch (e) {
        return res.status(500).json({ success: false, message: 'Failed to fetch by-company data.' });
    }
});
exports.getByCompany = getByCompany;
// GET /api/analytics/by-branch  – alumni grouped by branch
const getByBranch = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const alumni = yield prisma.alumni.findMany({ select: { branch: true } });
        const counts = {};
        alumni.forEach(a => { const b = a.branch || 'Unspecified'; counts[b] = (counts[b] || 0) + 1; });
        const data = Object.entries(counts)
            .map(([branch, count]) => ({ branch, count }))
            .sort((a, b) => b.count - a.count);
        return res.json({ success: true, data });
    }
    catch (e) {
        return res.status(500).json({ success: false, message: 'Failed to fetch by-branch data.' });
    }
});
exports.getByBranch = getByBranch;
// GET /api/analytics/export-csv?fields=...  – CSV download of placed students (alumni table)
const exportAnalyticsCsv = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { fields } = req.query;
        const allowed = ['firstName', 'lastName', 'department', 'cgpa', 'graduationYear', 'company', 'jobTitle', 'placementType', 'lockedReason'];
        const requestedFields = fields ? fields.split(',').map(f => f.trim()).filter(f => allowed.includes(f)) : allowed;
        const alumni = yield prisma.alumni.findMany({ orderBy: { createdAt: 'desc' } });
        const fieldMap = {
            firstName: a => (a.name || '').split(' ')[0],
            lastName: a => (a.name || '').split(' ').slice(1).join(' '),
            department: a => a.branch || '',
            company: a => a.companyName || '',
            jobTitle: a => a.role || '',
            graduationYear: a => a.placementYear || '',
            ctc: a => a.ctc || '',
            cgpa: a => '',
            placementType: a => 'ON_CAMPUS',
            lockedReason: a => '',
        };
        const header = requestedFields.join(',');
        const rows = alumni.map(a => requestedFields.map(f => { var _a, _b; return `"${String((_b = (_a = fieldMap[f]) === null || _a === void 0 ? void 0 : _a.call(fieldMap, a)) !== null && _b !== void 0 ? _b : '').replace(/"/g, '""')}"`; }).join(','));
        const csv = [header, ...rows].join('\n');
        res.header('Content-Type', 'text/csv');
        res.attachment(`placements_${new Date().toISOString().split('T')[0]}.csv`);
        return res.send(csv);
    }
    catch (e) {
        return res.status(500).json({ success: false, message: 'Failed to export CSV.' });
    }
});
exports.exportAnalyticsCsv = exportAnalyticsCsv;
// GET /api/dashboard/placement-trends?interval=month
const getPlacementTrends = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Build a time-series by grouping placementRecords by month of their placement Date.
        // In Prisma, natively grouping by arbitrary date truncation requires raw queries for Postgres,
        // but we can just pull them and bucket them in JS since the dataset isn't millions.
        const records = yield prisma.placementRecord.findMany({ select: { placedAt: true } });
        const buckets = {};
        records.forEach(r => {
            const date = new Date(r.placedAt);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            buckets[key] = (buckets[key] || 0) + 1;
        });
        // Sort keys
        const sortedKeys = Object.keys(buckets).sort();
        const data = sortedKeys.map(k => ({
            period: k,
            placements: buckets[k]
        }));
        return res.json({ success: true, data });
    }
    catch (e) {
        return res.status(500).json({ success: false, message: 'Failed to fetch placement trends.' });
    }
});
exports.getPlacementTrends = getPlacementTrends;
