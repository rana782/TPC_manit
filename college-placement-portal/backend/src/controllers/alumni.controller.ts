import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { parse } from 'json2csv';

const prisma = new PrismaClient();

// GET /api/alumni/search?q=...
// Global alumni search by name OR company (authenticated users)
export const searchAlumni = async (req: Request, res: Response) => {
    try {
        const q = String(req.query.q || '').trim();
        const branch = String(req.query.branch || '').trim();
        const yearRaw = String(req.query.year || '').trim();
        const year = yearRaw ? parseInt(yearRaw, 10) : NaN;
        const whereClause: any = q
            ? {
                  OR: [
                      { name: { contains: q, mode: 'insensitive' } },
                      { companyName: { contains: q, mode: 'insensitive' } }
                  ]
              }
            : {};
        if (branch && branch.toLowerCase() !== 'all') {
            whereClause.branch = branch;
        }
        if (!Number.isNaN(year)) {
            whereClause.placementYear = year;
        }

        const alumni = await prisma.alumni.findMany({
            where: whereClause,
            orderBy: [{ placementYear: 'desc' }, { createdAt: 'desc' }],
            select: {
                id: true,
                name: true,
                branch: true,
                companyName: true,
                role: true,
                ctc: true,
                placementYear: true,
                linkedinUrl: true
            }
        });

        return res.json({ success: true, data: alumni });
    } catch (e) {
        return res.status(500).json({ success: false, message: 'Failed to search alumni' });
    }
};

// GET /api/alumni/company/:companyName
export const getAlumniByCompany = async (req: Request, res: Response) => {
    try {
        const { companyName } = req.params;
        const { year, branch, role } = req.query;

        const whereClause: any = { companyName };
        if (year) whereClause.placementYear = parseInt(year as string);
        if (branch) whereClause.branch = branch as string;
        if (role) whereClause.role = { contains: role as string, mode: 'insensitive' };

        const alumni = await prisma.alumni.findMany({
            where: whereClause,
            orderBy: { placementYear: 'desc' }
        });

        return res.json({ success: true, data: alumni });
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
