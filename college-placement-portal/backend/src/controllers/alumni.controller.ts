import { Request, Response } from 'express';
import { parse } from 'json2csv';
import prisma from '../lib/prisma';
import { isTpcBranchCode, normalizeTpcBranch, prismaBranchMatchesCanonical } from '../utils/tpcBranches';

const ALUMNI_SELECT = {
    id: true,
    name: true,
    branch: true,
    companyName: true,
    role: true,
    ctc: true,
    placementYear: true,
    linkedinUrl: true,
    createdAt: true,
} as const;

function buildAlumniWhereClause(query: Request['query']) {
    const q = String(query.q || '').trim();
    const branch = String(query.branch || '').trim();
    const yearRaw = String(query.year || '').trim();
    const company = String(query.company || '').trim();
    const year = yearRaw ? parseInt(yearRaw, 10) : NaN;

    const and: any[] = [];

    if (q) {
        and.push({
            OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { companyName: { contains: q, mode: 'insensitive' } },
                { role: { contains: q, mode: 'insensitive' } },
            ],
        });
    }
    if (branch && branch.toLowerCase() !== 'all') {
        and.push(
            isTpcBranchCode(branch) ? prismaBranchMatchesCanonical(branch) : { branch: { equals: branch, mode: 'insensitive' } }
        );
    }
    if (!Number.isNaN(year)) {
        and.push({ placementYear: year });
    }
    if (company && company.toLowerCase() !== 'all') {
        and.push({ companyName: { equals: company, mode: 'insensitive' } });
    }

    if (!and.length) return {};
    if (and.length === 1) return and[0]!;
    return { AND: and };
}

// GET /api/alumni/search?q=...
// Global alumni search by name OR company (authenticated users)
export const searchAlumni = async (req: Request, res: Response) => {
    try {
        const whereClause = buildAlumniWhereClause(req.query);

        const alumni = await prisma.alumni.findMany({
            where: whereClause,
            orderBy: [{ placementYear: 'desc' }, { createdAt: 'desc' }],
            select: ALUMNI_SELECT,
        });
        const data = alumni.map((a) => ({ ...a, branch: normalizeTpcBranch(a.branch) }));
        return res.json({ success: true, data });
    } catch (e) {
        return res.status(500).json({ success: false, message: 'Failed to search alumni' });
    }
};

// GET /api/alumni/company/:companyName
export const getAlumniByCompany = async (req: Request, res: Response) => {
    try {
        const { companyName } = req.params;
        const { year, branch, role } = req.query;

        const and: any[] = [{ companyName }];
        if (year) and.push({ placementYear: parseInt(String(year), 10) });
        if (branch) {
            const b = String(branch);
            and.push(isTpcBranchCode(b) ? prismaBranchMatchesCanonical(b) : { branch: { equals: b, mode: 'insensitive' } });
        }
        if (role) and.push({ role: { contains: String(role), mode: 'insensitive' } });

        const alumni = await prisma.alumni.findMany({
            where: and.length > 1 ? { AND: and } : and[0]!,
            orderBy: { placementYear: 'desc' }
        });
        const data = alumni.map((a) => ({ ...a, branch: normalizeTpcBranch(a.branch) }));
        return res.json({ success: true, data });
    } catch (e) {
        return res.status(500).json({ success: false, message: 'Failed to fetch alumni' });
    }
};

// GET /api/export/placed
export const exportPlacedCsv = async (req: Request, res: Response) => {
    try {
        const { company_name, year } = req.query;

        const whereClause: any = {};
        if (company_name) whereClause.companyName = { contains: company_name as string, mode: 'insensitive' };
        if (year) whereClause.placementYear = parseInt(year as string);

        const alumni = await prisma.alumni.findMany({
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

        const csv = parse(alumni, { fields: ['name', 'branch', 'companyName', 'role', 'ctc', 'placementYear', 'linkedinUrl'] });

        res.header('Content-Type', 'text/csv');
        res.attachment(`alumni_export_${new Date().toISOString().split('T')[0]}.csv`);
        return res.send(csv);

    } catch (e) {
        console.error('CSV Export Error:', e);
        return res.status(500).json({ success: false, message: 'Failed to export CSV' });
    }
};

// GET /api/alumni/export?...
// Exports currently filtered alumni data as Excel-friendly CSV.
export const exportAlumniFilteredCsv = async (req: Request, res: Response) => {
    try {
        const whereClause = buildAlumniWhereClause(req.query);
        const alumni = await prisma.alumni.findMany({
            where: whereClause,
            orderBy: [{ placementYear: 'desc' }, { createdAt: 'desc' }],
            select: ALUMNI_SELECT,
        });

        if (alumni.length === 0) {
            return res.status(404).json({ success: false, message: 'No alumni records found for selected filters' });
        }

        const rows = alumni.map((a, idx) => ({
            'S.No.': idx + 1,
            'Name': a.name || '',
            'Branch': normalizeTpcBranch(a.branch) || '',
            'Company': a.companyName || '',
            'Role': a.role || '',
            'Package (LPA)': a.ctc || '',
            'Placement Year': a.placementYear ?? '',
            'LinkedIn': a.linkedinUrl || '',
            'Added On': a.createdAt ? new Date(a.createdAt).toISOString().slice(0, 10) : '',
        }));
        const csv = parse(rows, {
            fields: ['S.No.', 'Name', 'Branch', 'Company', 'Role', 'Package (LPA)', 'Placement Year', 'LinkedIn', 'Added On'],
        });

        const dateStamp = new Date().toISOString().slice(0, 10);
        const fileName = `alumni_filtered_export_${dateStamp}.csv`;
        res.header('Content-Type', 'text/csv; charset=utf-8');
        res.header('Content-Disposition', `attachment; filename="${fileName}"`);
        return res.send(`\uFEFF${csv}`);
    } catch (e) {
        console.error('Filtered Alumni CSV Export Error:', e);
        return res.status(500).json({ success: false, message: 'Failed to export alumni data' });
    }
};
