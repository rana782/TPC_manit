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
exports.exportPlacedCsv = exports.getAlumniByCompany = void 0;
const client_1 = require("@prisma/client");
const json2csv_1 = require("json2csv");
const prisma = new client_1.PrismaClient();
// GET /api/alumni/company/:companyName
const getAlumniByCompany = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { companyName } = req.params;
        const { year, branch, role } = req.query;
        const whereClause = { companyName };
        if (year)
            whereClause.placementYear = parseInt(year);
        if (branch)
            whereClause.branch = branch;
        if (role)
            whereClause.role = { contains: role, mode: 'insensitive' };
        const alumni = yield prisma.alumni.findMany({
            where: whereClause,
            orderBy: { placementYear: 'desc' }
        });
        return res.json({ success: true, data: alumni });
    }
    catch (e) {
        return res.status(500).json({ success: false, message: 'Failed to fetch alumni' });
    }
});
exports.getAlumniByCompany = getAlumniByCompany;
// GET /api/export/placed
const exportPlacedCsv = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { company_name, year } = req.query;
        const whereClause = {};
        if (company_name)
            whereClause.companyName = { contains: company_name, mode: 'insensitive' };
        if (year)
            whereClause.placementYear = parseInt(year);
        const alumni = yield prisma.alumni.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' },
            select: {
                name: true,
                branch: true,
                companyName: true,
                role: true,
                ctc: true,
                placementYear: true,
                linkedinUrl: true
            }
        });
        if (alumni.length === 0) {
            return res.status(404).json({ success: false, message: 'No records found to export' });
        }
        const csv = (0, json2csv_1.parse)(alumni, { fields: ['name', 'branch', 'companyName', 'role', 'ctc', 'placementYear', 'linkedinUrl'] });
        res.header('Content-Type', 'text/csv');
        res.attachment(`alumni_export_${new Date().toISOString().split('T')[0]}.csv`);
        return res.send(csv);
    }
    catch (e) {
        console.error('CSV Export Error:', e);
        return res.status(500).json({ success: false, message: 'Failed to export CSV' });
    }
});
exports.exportPlacedCsv = exportPlacedCsv;
