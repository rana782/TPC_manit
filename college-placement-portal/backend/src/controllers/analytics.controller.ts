import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { compareTpcBranchNames, normalizeTpcBranch } from '../utils/tpcBranches';

function parseCtcToNumber(ctc?: string | null): number | null {
    if (!ctc) return null;
    const num = parseFloat(String(ctc).replace(/[^0-9.]/g, ''));
    return Number.isFinite(num) ? num : null;
}

function computeMedian(nums: number[]): number | null {
    if (!nums.length) return null;
    const sorted = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) return sorted[mid];
    return (sorted[mid - 1] + sorted[mid]) / 2;
}

// GET /api/dashboard/summary
export const getSummary = async (req: Request, res: Response) => {
    try {
        const [totalStudents, totalJobs, totalApplications, totalPlaced] = await Promise.all([
            prisma.student.count(),
            prisma.job.count(),
            prisma.jobApplication.count(),
            prisma.placementRecord.count()
        ]);
        return res.json({ success: true, summary: { totalStudents, totalJobs, totalApplications, totalPlaced } });
    } catch (e: any) {
        return res.status(500).json({ success: false, message: 'Failed to fetch summary metrics.' });
    }
};

// GET /api/dashboard/branch-comparison
export const getBranchComparison = async (req: Request, res: Response) => {
    try {
        const { from, to } = req.query;
        let placementYearFilter = {};
        if (from || to) {
            placementYearFilter = {
                placementYear: {
                    ...(from ? { gte: parseInt(from as string) } : {}),
                    ...(to ? { lte: parseInt(to as string) } : {})
                }
            };
        }

        const alumni = await prisma.alumni.findMany({
            where: placementYearFilter,
            select: { branch: true, ctc: true }
        });

        const branchStats: Record<string, { count: number; totalCtc: number; parsedCtcs: number }> = {};

        alumni.forEach(a => {
            const b = normalizeTpcBranch(a.branch) || 'Unknown';
            if (!branchStats[b]) branchStats[b] = { count: 0, totalCtc: 0, parsedCtcs: 0 };
            
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

        const sorted = result.sort((x, y) => compareTpcBranchNames(x.branch, y.branch));
        return res.json({ success: true, data: sorted });

    } catch (e: any) {
        return res.status(500).json({ success: false, message: 'Failed to fetch branch comparison.' });
    }
};

// GET /api/dashboard/company-history/:companyName
export const getCompanyHistory = async (req: Request, res: Response) => {
    try {
        const { companyName } = req.params;
        const result = await prisma.alumni.groupBy({
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
    } catch (e: any) {
        return res.status(500).json({ success: false, message: 'Failed to fetch company history.' });
    }
};

// GET /api/analytics/by-year  – alumni grouped by placementYear
export const getByYear = async (req: Request, res: Response) => {
    try {
        const records = await prisma.alumni.groupBy({
            by: ['placementYear'],
            _count: { studentId: true },
            orderBy: { placementYear: 'asc' }
        });
        const data = records.map(r => ({ year: r.placementYear, count: r._count.studentId }));
        return res.json({ success: true, data });
    } catch (e: any) {
        return res.status(500).json({ success: false, message: 'Failed to fetch by-year data.' });
    }
};

// GET /api/analytics/by-company?limit=10  – top companies by accepted applications
export const getByCompany = async (req: Request, res: Response) => {
    try {
        const limit = parseInt((req.query.limit as string) || '10');
        const jobs = await prisma.job.findMany({
            include: { applications: { where: { status: 'ACCEPTED' }, select: { id: true } } },
            orderBy: { createdAt: 'desc' }
        });
        const data = jobs
            .map(j => ({ company: j.companyName, title: j.role, acceptedCount: j.applications.length }))
            .filter(j => j.acceptedCount > 0)
            .sort((a, b) => b.acceptedCount - a.acceptedCount)
            .slice(0, limit);
        return res.json({ success: true, data });
    } catch (e: any) {
        return res.status(500).json({ success: false, message: 'Failed to fetch by-company data.' });
    }
};

// GET /api/analytics/by-branch  – alumni grouped by branch
export const getByBranch = async (req: Request, res: Response) => {
    try {
        const alumni = await prisma.alumni.findMany({ select: { branch: true } });
        const counts: Record<string, number> = {};
        alumni.forEach((a) => {
            const b = normalizeTpcBranch(a.branch) || 'Unspecified';
            counts[b] = (counts[b] || 0) + 1;
        });
        const data = Object.entries(counts)
            .map(([branch, count]) => ({ branch, count }))
            .sort((a, b) => compareTpcBranchNames(a.branch, b.branch) || b.count - a.count);
        return res.json({ success: true, data });
    } catch (e: any) {
        return res.status(500).json({ success: false, message: 'Failed to fetch by-branch data.' });
    }
};

// GET /api/analytics/branch-wise-current
// Branch-wise currently placed students (placementRecord as source of truth)
export const getBranchWiseCurrent = async (req: Request, res: Response) => {
    try {
        const records = await prisma.placementRecord.findMany({
            include: {
                student: { select: { branch: true } }
            },
            orderBy: { placedAt: 'asc' }
        });

        type BranchAgg = {
            placedCount: number;
            ctcValues: number[];
            companyCounts: Record<string, number>;
            timeline: Record<string, number>; // YYYY-MM
        };

        const branchMap: Record<string, BranchAgg> = {};
        for (const r of records) {
            const branch = normalizeTpcBranch(r.student?.branch) || 'Unknown';
            if (!branchMap[branch]) {
                branchMap[branch] = {
                    placedCount: 0,
                    ctcValues: [],
                    companyCounts: {},
                    timeline: {}
                };
            }
            const agg = branchMap[branch];
            agg.placedCount += 1;
            const ctcNum = parseCtcToNumber(r.ctc);
            if (ctcNum != null) agg.ctcValues.push(ctcNum);
            const company = r.companyName || 'Unknown';
            agg.companyCounts[company] = (agg.companyCounts[company] || 0) + 1;
            const d = new Date(r.placedAt);
            const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            agg.timeline[ym] = (agg.timeline[ym] || 0) + 1;
        }

        const branchWise = Object.entries(branchMap)
            .map(([branch, agg]) => {
                const avg = agg.ctcValues.length
                    ? agg.ctcValues.reduce((s, n) => s + n, 0) / agg.ctcValues.length
                    : null;
                const median = computeMedian(agg.ctcValues);
                const timeline = Object.keys(agg.timeline)
                    .sort()
                    .map((label) => ({ label, value: agg.timeline[label] }));
                const companyDistribution = Object.entries(agg.companyCounts)
                    .map(([companyName, count]) => ({ companyName, count }))
                    .sort((a, b) => b.count - a.count);
                return {
                    branch,
                    placedCount: agg.placedCount,
                    averagePackage: avg != null ? Number(avg.toFixed(2)) : null,
                    medianPackage: median != null ? Number(median.toFixed(2)) : null,
                    timeline,
                    companyDistribution
                };
            })
            .sort((a, b) => compareTpcBranchNames(a.branch, b.branch) || b.placedCount - a.placedCount);

        return res.json({ success: true, branchWise });
    } catch (e: any) {
        return res.status(500).json({ success: false, message: 'Failed to fetch branch-wise current placement analytics.' });
    }
};

// GET /api/analytics/export-csv?fields=...  – CSV download of placed students (alumni table)
export const exportAnalyticsCsv = async (req: Request, res: Response) => {
    try {
        const { fields } = req.query;
        const allowed = ['branch', 'totalPlaced', 'averagePackage', 'medianPackage', 'placementYear', 'companyNames'];
        const requestedFields = fields
            ? (fields as string).split(',').map(f => f.trim()).filter(f => allowed.includes(f))
            : allowed;

        const records = await prisma.placementRecord.findMany({
            include: {
                student: { select: { branch: true } }
            },
            orderBy: { placedAt: 'desc' }
        });

        type Key = string;
        const grouped: Record<Key, { branch: string; placementYear: number; ctcValues: number[]; companies: Set<string>; totalPlaced: number }> = {};
        for (const r of records) {
            const branch = normalizeTpcBranch(r.student?.branch) || 'Unknown';
            const placementYear = new Date(r.placedAt).getFullYear();
            const k = `${branch}__${placementYear}`;
            if (!grouped[k]) {
                grouped[k] = { branch, placementYear, ctcValues: [], companies: new Set(), totalPlaced: 0 };
            }
            grouped[k].totalPlaced += 1;
            const ctcNum = parseCtcToNumber(r.ctc);
            if (ctcNum != null) grouped[k].ctcValues.push(ctcNum);
            if (r.companyName) grouped[k].companies.add(r.companyName);
        }

        const rowsData = Object.values(grouped).map((g) => {
            const avg = g.ctcValues.length ? g.ctcValues.reduce((s, n) => s + n, 0) / g.ctcValues.length : null;
            const med = computeMedian(g.ctcValues);
            return {
                branch: g.branch,
                totalPlaced: g.totalPlaced,
                averagePackage: avg != null ? avg.toFixed(2) : '',
                medianPackage: med != null ? med.toFixed(2) : '',
                placementYear: g.placementYear,
                companyNames: Array.from(g.companies).sort().join(' | ')
            };
        }).sort((a, b) => (b.placementYear - a.placementYear) || b.totalPlaced - a.totalPlaced);

        const header = requestedFields.join(',');
        const rows = rowsData.map((row) =>
            requestedFields.map((f) => `"${String((row as any)[f] ?? '').replace(/"/g, '""')}"`).join(',')
        );
        const csv = [header, ...rows].join('\n');

        res.header('Content-Type', 'text/csv');
        res.attachment(`branch_wise_placements_${new Date().toISOString().split('T')[0]}.csv`);
        return res.send(csv);
    } catch (e: any) {
        return res.status(500).json({ success: false, message: 'Failed to export CSV.' });
    }
};

// GET /api/dashboard/placement-trends?interval=month
export const getPlacementTrends = async (req: Request, res: Response) => {
    try {
        // Build a time-series by grouping placementRecords by month of their placement Date.
        // In Prisma, natively grouping by arbitrary date truncation requires raw queries for Postgres,
        // but we can just pull them and bucket them in JS since the dataset isn't millions.
        const records = await prisma.placementRecord.findMany({ select: { placedAt: true } });
        
        const buckets: Record<string, number> = {};
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
    } catch (e: any) {
        return res.status(500).json({ success: false, message: 'Failed to fetch placement trends.' });
    }
};
