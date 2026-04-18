/**
 * Decision-grade placement analytics (Student, Job, JobStage, JobApplication, PlacementRecord).
 * Optional ?year=YYYY scopes placement/application/job-created/stage metrics to that calendar year.
 */
import { Request, Response } from 'express';
import prisma from '../lib/prisma';

export function parseYearQuery(req: Request): number | null {
    const raw = req.query.year;
    if (raw === undefined || raw === '' || raw === 'all') return null;
    const y = parseInt(String(raw), 10);
    if (!Number.isFinite(y) || y < 1970 || y > 2100) return null;
    return y;
}

function yearRange(y: number): { start: Date; end: Date } {
    return {
        start: new Date(Date.UTC(y, 0, 1, 0, 0, 0, 0)),
        end: new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999)),
    };
}

export function parseCtcToNumber(ctc?: string | null): number | null {
    if (!ctc) return null;
    const num = parseFloat(String(ctc).replace(/[^0-9.]/g, ''));
    return Number.isFinite(num) ? num : null;
}

function median(nums: number[]): number | null {
    if (!nums.length) return null;
    const s = [...nums].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function mean(nums: number[]): number | null {
    if (!nums.length) return null;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
}


/** Applications filter: appliedAt in year (if set). */
function applicationWhere(year: number | null) {
    if (year == null) return {};
    const { start, end } = yearRange(year);
    return { appliedAt: { gte: start, lte: end } };
}

function placementWhere(year: number | null) {
    if (year == null) return {};
    const { start, end } = yearRange(year);
    return { placedAt: { gte: start, lte: end } };
}

function jobCreatedWhere(year: number | null) {
    if (year == null) return {};
    const { start, end } = yearRange(year);
    return { createdAt: { gte: start, lte: end } };
}

async function computeOverviewPayload(year: number | null) {
    const appWh = applicationWhere(year);
    const placeWh = placementWhere(year);
    const jobWh = jobCreatedWhere(year);

    const cohortRows = await prisma.jobApplication.findMany({
        where: appWh,
        select: { studentId: true },
    });
    const cohortStudentIds = [...new Set(cohortRows.map((r) => r.studentId))];

    const [totalStudentsAll, placementsInScope, jobsPublished, companyNameRows, totalApplications] = await Promise.all([
        prisma.student.count(),
        prisma.placementRecord.findMany({
            where: placeWh,
            select: { studentId: true, ctc: true },
        }),
        prisma.job.count({
            where: {
                status: 'PUBLISHED',
                ...(year != null ? jobWh : {}),
            },
        }),
        prisma.job.findMany({
            where: { status: 'PUBLISHED', ...(year != null ? jobWh : {}) },
            select: { companyName: true },
        }),
        prisma.jobApplication.count({ where: appWh }),
    ]);

    const cohortSize = year == null ? totalStudentsAll : cohortStudentIds.length;
    const cohortFilter =
        year == null || cohortStudentIds.length === 0
            ? null
            : ({ id: { in: cohortStudentIds } } as const);

    const [lockedInCohort, backlogInCohort] = await Promise.all([
        year == null
            ? prisma.student.count({ where: { isLocked: true } })
            : cohortFilter
              ? prisma.student.count({ where: { ...cohortFilter, isLocked: true } })
              : Promise.resolve(0),
        year == null
            ? prisma.student.count({ where: { backlogs: { gt: 0 } } })
            : cohortFilter
              ? prisma.student.count({ where: { ...cohortFilter, backlogs: { gt: 0 } } })
              : Promise.resolve(0),
    ]);

    const placedIds = new Set(placementsInScope.map((p) => p.studentId));
    const placedStudents = placedIds.size;
    const denom = year == null ? Math.max(totalStudentsAll, 1) : Math.max(cohortSize, 1);
    const placementRatePct = denom > 0 ? Math.round((placedStudents / denom) * 10000) / 100 : 0;
    const ctcVals = placementsInScope.map((p) => parseCtcToNumber(p.ctc)).filter((n): n is number => n != null);

    return {
        totalStudents: year == null ? totalStudentsAll : cohortSize,
        placedStudents,
        placementRatePct,
        totalJobsPublished: jobsPublished,
        totalCompanies: new Set(
            companyNameRows.map((j) => j.companyName.trim()).filter(Boolean)
        ).size,
        totalApplications,
        averageCtcLpa: mean(ctcVals),
        medianCtcLpa: median(ctcVals),
        lockedProfiles: lockedInCohort,
        studentsWithBacklogs: backlogInCohort,
    };
}

// GET /api/analytics/overview?year=
export const getDashboardOverview = async (req: Request, res: Response) => {
    try {
        const year = parseYearQuery(req);
        const overview = await computeOverviewPayload(year);
        return res.json({
            success: true,
            year: year ?? 'all',
            overview,
        });
    } catch (e) {
        console.error('[analytics/overview]', e);
        return res.status(500).json({ success: false, message: 'Failed to load overview.' });
    }
};

async function computeTrendsPayload(year: number | null) {
    const [placements, jobs, apps] = await Promise.all([
        prisma.placementRecord.findMany({ select: { placedAt: true } }),
        prisma.job.findMany({ where: { status: 'PUBLISHED' }, select: { createdAt: true } }),
        prisma.jobApplication.findMany({ select: { appliedAt: true } }),
    ]);

    const bucket = (dates: Date[], getY: (d: Date) => number) => {
        const m: Record<number, number> = {};
        for (const d of dates) {
            const y = getY(d);
            m[y] = (m[y] || 0) + 1;
        }
        return m;
    };

    const py = bucket(
        placements.map((p) => new Date(p.placedAt)),
        (d) => d.getFullYear()
    );
    const jy = bucket(
        jobs.map((j) => new Date(j.createdAt)),
        (d) => d.getFullYear()
    );
    const ay = bucket(
        apps.map((a) => new Date(a.appliedAt)),
        (d) => d.getFullYear()
    );

    const allYears = [...new Set([...Object.keys(py), ...Object.keys(jy), ...Object.keys(ay)].map(Number))].sort(
        (a, b) => a - b
    );
    if (!allYears.length) {
        return [];
    }

    const endY = year ?? allYears[allYears.length - 1]!;
    const startY = Math.min(...allYears.filter((y) => y <= endY));
    const windowStart = Math.max(startY, endY - 9);

    const trends: { year: number; placedStudents: number; jobsPosted: number; applications: number }[] = [];
    for (let y = windowStart; y <= endY; y++) {
        trends.push({
            year: y,
            placedStudents: py[y] || 0,
            jobsPosted: jy[y] || 0,
            applications: ay[y] || 0,
        });
    }
    return trends;
}

// GET /api/analytics/trends?year= optional end anchor — returns window of years with data
export const getDashboardTrends = async (req: Request, res: Response) => {
    try {
        const year = parseYearQuery(req);
        const trends = await computeTrendsPayload(year);
        return res.json({ success: true, year: year ?? 'all', trends });
    } catch (e) {
        console.error('[analytics/trends]', e);
        return res.status(500).json({ success: false, message: 'Failed to load trends.' });
    }
};

/** Shared branch × placement cohort + per-branch CTC lists (for API + CSV). */
async function computeBranchPlacementAnalytics(year: number | null) {
    const appWh = applicationWhere(year);
    const placeWh = placementWhere(year);

    const apps = await prisma.jobApplication.findMany({
        where: appWh,
        select: { studentId: true, student: { select: { branch: true } } },
    });

    const branchStudents: Record<string, Set<string>> = {};
    for (const a of apps) {
        const b = a.student?.branch?.trim() || 'Unknown';
        if (!branchStudents[b]) branchStudents[b] = new Set();
        branchStudents[b]!.add(a.studentId);
    }

    const placements = await prisma.placementRecord.findMany({
        where: placeWh,
        include: { student: { select: { branch: true } } },
    });

    const branchPlaced: Record<string, Set<string>> = {};
    const branchCtc: Record<string, number[]> = {};
    const allCtc: number[] = [];

    for (const p of placements) {
        const b = p.student?.branch?.trim() || 'Unknown';
        if (!branchPlaced[b]) branchPlaced[b] = new Set();
        branchPlaced[b]!.add(p.studentId);
        const n = parseCtcToNumber(p.ctc);
        if (n != null) {
            if (!branchCtc[b]) branchCtc[b] = [];
            branchCtc[b]!.push(n);
            allCtc.push(n);
        }
    }

    const branchNames = [...new Set([...Object.keys(branchStudents), ...Object.keys(branchPlaced)])].sort();
    const rows = branchNames.map((branch) => {
        const total = branchStudents[branch]?.size ?? 0;
        const placed = branchPlaced[branch]?.size ?? 0;
        const rate = total > 0 ? Math.round((placed / total) * 10000) / 100 : placed > 0 ? 100 : 0;
        const ctcs = branchCtc[branch] || [];
        const mn = ctcs.length ? Math.min(...ctcs) : null;
        const mx = ctcs.length ? Math.max(...ctcs) : null;
        return {
            branch,
            totalStudents: total,
            placedStudents: placed,
            placementRatePct: rate,
            placementsWithCtc: ctcs.length,
            minCtcLpa: mn != null ? Number(mn.toFixed(2)) : null,
            maxCtcLpa: mx != null ? Number(mx.toFixed(2)) : null,
            averageCtcLpa: mean(ctcs),
            medianCtcLpa: median(ctcs),
        };
    });

    const gMin = allCtc.length ? Math.min(...allCtc) : null;
    const gMax = allCtc.length ? Math.max(...allCtc) : null;
    const totalPlacedStudents = new Set(placements.map((p) => p.studentId)).size;

    return {
        rows,
        totalPlacedStudents,
        placementCtcSummary: {
            placementsWithCtc: allCtc.length,
            minCtcLpa: gMin != null ? Number(gMin.toFixed(2)) : null,
            maxCtcLpa: gMax != null ? Number(gMax.toFixed(2)) : null,
            averageCtcLpa: mean(allCtc),
            medianCtcLpa: median(allCtc),
        },
    };
}

// GET /api/analytics/branch?year=
export const getDashboardBranch = async (req: Request, res: Response) => {
    try {
        const year = parseYearQuery(req);
        const { rows, placementCtcSummary, totalPlacedStudents } = await computeBranchPlacementAnalytics(year);

        return res.json({
            success: true,
            year: year ?? 'all',
            branches: rows,
            placementCtcSummary,
            totalPlacedStudents,
        });
    } catch (e) {
        console.error('[analytics/branch]', e);
        return res.status(500).json({ success: false, message: 'Failed to load branch analytics.' });
    }
};

async function computeCompanyDashboardRows(year: number | null) {
    const appWh = applicationWhere(year);
    const placeWh = placementWhere(year);
    const jobWh = jobCreatedWhere(year);

    const jobs = await prisma.job.findMany({
        where: { status: 'PUBLISHED', ...(year != null ? jobWh : {}) },
        select: { companyName: true, id: true },
    });

    const apps = await prisma.jobApplication.findMany({
        where: appWh,
        select: { jobId: true },
    });

    const placements = await prisma.placementRecord.findMany({
        where: placeWh,
        select: { companyName: true, ctc: true },
    });

    const jobCompany = new Map(jobs.map((j) => [j.id, j.companyName.trim() || 'Unknown']));
    const appsPerCompany: Record<string, number> = {};
    for (const a of apps) {
        const c = jobCompany.get(a.jobId) || 'Unknown';
        appsPerCompany[c] = (appsPerCompany[c] || 0) + 1;
    }

    const jobsPerCompany: Record<string, number> = {};
    for (const j of jobs) {
        const c = j.companyName.trim() || 'Unknown';
        jobsPerCompany[c] = (jobsPerCompany[c] || 0) + 1;
    }

    const placePerCompany: Record<string, number> = {};
    const ctcPerCompany: Record<string, number[]> = {};
    for (const p of placements) {
        const c = (p.companyName || 'Unknown').trim();
        placePerCompany[c] = (placePerCompany[c] || 0) + 1;
        const n = parseCtcToNumber(p.ctc);
        if (n != null) {
            if (!ctcPerCompany[c]) ctcPerCompany[c] = [];
            ctcPerCompany[c]!.push(n);
        }
    }

    const companyKeys = [
        ...new Set([...Object.keys(appsPerCompany), ...Object.keys(placePerCompany), ...Object.keys(jobsPerCompany)]),
    ].sort();

    const rows = companyKeys.map((companyName) => {
        const ja = appsPerCompany[companyName] || 0;
        const jp = placePerCompany[companyName] || 0;
        const jn = jobsPerCompany[companyName] || 0;
        const ctcs = ctcPerCompany[companyName] || [];
        return {
            companyName,
            jobsPosted: jn,
            placements: jp,
            applications: ja,
            averageCtcLpa: mean(ctcs),
            conversionRatePct: ja > 0 ? Math.round((jp / ja) * 10000) / 100 : jp > 0 ? 100 : 0,
        };
    });

    rows.sort((a, b) => b.placements - a.placements);
    return rows;
}

// GET /api/analytics/company?year=
export const getDashboardCompany = async (req: Request, res: Response) => {
    try {
        const year = parseYearQuery(req);
        const rows = await computeCompanyDashboardRows(year);
        return res.json({ success: true, year: year ?? 'all', companies: rows });
    } catch (e) {
        console.error('[analytics/company]', e);
        return res.status(500).json({ success: false, message: 'Failed to load company analytics.' });
    }
};

async function computeCtcDashboardPayload(year: number | null) {
    const placeWh = placementWhere(year);

    const placements = await prisma.placementRecord.findMany({
        where: placeWh,
        select: { ctc: true },
    });

    const values = placements.map((p) => parseCtcToNumber(p.ctc)).filter((n): n is number => n != null);

    const buckets = {
        lt3: 0,
        range3to6: 0,
        range6to10: 0,
        range10to15: 0,
        gte15: 0,
    };

    for (const v of values) {
        if (v < 3) buckets.lt3++;
        else if (v < 6) buckets.range3to6++;
        else if (v < 10) buckets.range6to10++;
        else if (v < 15) buckets.range10to15++;
        else buckets.gte15++;
    }

    const chart = [
        { bucket: '<3 LPA', count: buckets.lt3 },
        { bucket: '3-6 LPA', count: buckets.range3to6 },
        { bucket: '6-10 LPA', count: buckets.range6to10 },
        { bucket: '10-15 LPA', count: buckets.range10to15 },
        { bucket: '15+ LPA', count: buckets.gte15 },
    ];

    const max = values.length ? Math.max(...values) : null;

    return {
        distribution: chart,
        stats: {
            count: values.length,
            averageLpa: mean(values),
            medianLpa: median(values),
            maxLpa: max,
        },
    };
}

// GET /api/analytics/ctc?year=
export const getDashboardCtc = async (req: Request, res: Response) => {
    try {
        const year = parseYearQuery(req);
        const { distribution, stats } = await computeCtcDashboardPayload(year);
        return res.json({
            success: true,
            year: year ?? 'all',
            distribution,
            stats,
        });
    } catch (e) {
        console.error('[analytics/ctc]', e);
        return res.status(500).json({ success: false, message: 'Failed to load CTC distribution.' });
    }
};

/**
 * Single round-trip for the placement analytics UI (avoids Supabase pooler / browser
 * limits from five parallel heavy queries).
 */
export const getPlacementDashboardBundle = async (req: Request, res: Response) => {
    try {
        const year = parseYearQuery(req);
        const overview = await computeOverviewPayload(year);
        const trends = await computeTrendsPayload(year);
        const { rows: branches, placementCtcSummary, totalPlacedStudents } = await computeBranchPlacementAnalytics(year);
        const companies = await computeCompanyDashboardRows(year);
        const { distribution, stats } = await computeCtcDashboardPayload(year);

        return res.json({
            success: true,
            year: year ?? 'all',
            overview,
            trends,
            branches,
            placementCtcSummary,
            totalPlacedStudents,
            companies,
            distribution,
            stats,
        });
    } catch (e) {
        console.error('[analytics/placement-dashboard]', e);
        return res.status(500).json({ success: false, message: 'Failed to load placement analytics.' });
    }
};

// GET /api/analytics/branch-report-excel?branch=...&year=
export const exportBranchTimelineExcel = async (req: Request, res: Response) => {
    try {
        const branchRaw = String(req.query.branch || '').trim();
        if (!branchRaw) {
            return res.status(400).json({ success: false, message: 'branch query parameter is required.' });
        }
        const branch = branchRaw.slice(0, 120);
        const year = parseYearQuery(req);
        const placeWh = placementWhere(year);

        const placements = await prisma.placementRecord.findMany({
            where: {
                ...placeWh,
                student: { branch: branch },
            },
            include: {
                student: {
                    select: {
                        firstName: true,
                        lastName: true,
                        scholarNo: true,
                        linkedin: true,
                        resumes: {
                            where: { isActive: true },
                            orderBy: { updatedAt: 'desc' },
                            select: { fileUrl: true },
                            take: 1,
                        },
                    },
                },
            },
            orderBy: { placedAt: 'asc' },
        });

        const ctcVals = placements
            .map((p) => parseCtcToNumber(p.ctc))
            .filter((n): n is number => n != null);
        const stats = {
            min: ctcVals.length ? Math.min(...ctcVals) : null,
            max: ctcVals.length ? Math.max(...ctcVals) : null,
            avg: mean(ctcVals),
            median: median(ctcVals),
        };

        const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const lines: string[] = [];
        lines.push(
            [
                'placedAt',
                'studentName',
                'scholarNo',
                'branch',
                'companyName',
                'role',
                'ctc',
                'resumeUrl',
                'linkedinUrl',
            ]
                .map(esc)
                .join(',')
        );
        for (const p of placements) {
            const studentName = `${p.student.firstName || ''} ${p.student.lastName || ''}`.trim() || 'Unknown';
            const scholarNo = p.student.scholarNo || 'N/A';
            const resumeUrl = p.student.resumes?.[0]?.fileUrl || '';
            const linkedinUrl = p.student.linkedin || '';
            lines.push(
                [
                    new Date(p.placedAt).toISOString(),
                    studentName,
                    scholarNo,
                    branch,
                    p.companyName || '',
                    p.role || '',
                    p.ctc || '',
                    resumeUrl,
                    linkedinUrl,
                ]
                    .map(esc)
                    .join(',')
            );
        }
        lines.push('');
        lines.push([ 'summaryMetric', 'value' ].map(esc).join(','));
        lines.push([ 'branch', branch ].map(esc).join(','));
        lines.push([ 'yearFilter', year ?? 'All years' ].map(esc).join(','));
        lines.push([ 'placementsCount', placements.length ].map(esc).join(','));
        lines.push([ 'ctcRecordsCount', ctcVals.length ].map(esc).join(','));
        lines.push([ 'minCtcLpa', stats.min != null ? stats.min.toFixed(2) : '' ].map(esc).join(','));
        lines.push([ 'maxCtcLpa', stats.max != null ? stats.max.toFixed(2) : '' ].map(esc).join(','));
        lines.push([ 'avgCtcLpa', stats.avg != null ? stats.avg.toFixed(2) : '' ].map(esc).join(','));
        lines.push([ 'medianCtcLpa', stats.median != null ? stats.median.toFixed(2) : '' ].map(esc).join(','));

        const safeBranch = branch.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 40) || 'branch';
        const fileName = `branch_placement_timeline_${safeBranch}_${year ?? 'all'}.csv`;

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        return res.send(`\uFEFF${lines.join('\n')}`);
    } catch (e) {
        console.error('[analytics/branch-report-excel]', e);
        return res.status(500).json({ success: false, message: 'Failed to generate branch report export.' });
    }
};

/** CSV export helper for company rows. */
async function getDashboardCompanyData(year: number | null) {
    const appWh = applicationWhere(year);
    const placeWh = placementWhere(year);
    const jobWh = jobCreatedWhere(year);
    const jobs = await prisma.job.findMany({
        where: { status: 'PUBLISHED', ...(year != null ? jobWh : {}) },
        select: { companyName: true, id: true },
    });
    const apps = await prisma.jobApplication.findMany({ where: appWh, select: { jobId: true } });
    const placements = await prisma.placementRecord.findMany({ where: placeWh, select: { companyName: true } });
    const jobCompany = new Map(jobs.map((j) => [j.id, j.companyName.trim() || 'Unknown']));
    const appsPerCompany: Record<string, number> = {};
    for (const a of apps) {
        const c = jobCompany.get(a.jobId) || 'Unknown';
        appsPerCompany[c] = (appsPerCompany[c] || 0) + 1;
    }
    const placePerCompany: Record<string, number> = {};
    for (const p of placements) {
        const c = (p.companyName || 'Unknown').trim();
        placePerCompany[c] = (placePerCompany[c] || 0) + 1;
    }
    const companies = [...new Set([...Object.keys(appsPerCompany), ...Object.keys(placePerCompany)])];
    return companies.map((companyName) => {
        const ja = appsPerCompany[companyName] || 0;
        const jp = placePerCompany[companyName] || 0;
        return { companyName, placements: jp, applications: ja };
    });
}

// GET /api/analytics/export-dashboard?type=branch|company|placement-ctc|placement-ctc-total|summary&year=
export const exportDashboardCsv = async (req: Request, res: Response) => {
    try {
        const type = String(req.query.type || 'summary');
        const year = parseYearQuery(req);

        const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

        if (type === 'branch') {
            const { rows } = await computeBranchPlacementAnalytics(year);
            const header =
                'branch,totalStudents,placedStudents,placementRatePct,placementsWithCtc,minCtcLpa,maxCtcLpa,averageCtcLpa,medianCtcLpa';
            const lines = [header];
            for (const r of rows) {
                lines.push(
                    [
                        r.branch,
                        r.totalStudents,
                        r.placedStudents,
                        r.placementRatePct,
                        r.placementsWithCtc,
                        r.minCtcLpa ?? '',
                        r.maxCtcLpa ?? '',
                        r.averageCtcLpa != null ? r.averageCtcLpa.toFixed(2) : '',
                        r.medianCtcLpa != null ? r.medianCtcLpa.toFixed(2) : '',
                    ]
                        .map(esc)
                        .join(',')
                );
            }
            res.header('Content-Type', 'text/csv');
            res.attachment(`analytics_branch_${year ?? 'all'}.csv`);
            return res.send(lines.join('\n'));
        }

        if (type === 'placement-ctc') {
            const { rows, placementCtcSummary, totalPlacedStudents } = await computeBranchPlacementAnalytics(year);
            const header =
                'rowType,branch,totalStudents,placedStudents,placementRatePct,placementsWithCtc,minCtcLpa,maxCtcLpa,averageCtcLpa,medianCtcLpa';
            const lines = [header];
            for (const r of rows) {
                lines.push(
                    [
                        'branch',
                        r.branch,
                        r.totalStudents,
                        r.placedStudents,
                        r.placementRatePct,
                        r.placementsWithCtc,
                        r.minCtcLpa ?? '',
                        r.maxCtcLpa ?? '',
                        r.averageCtcLpa != null ? r.averageCtcLpa.toFixed(2) : '',
                        r.medianCtcLpa != null ? r.medianCtcLpa.toFixed(2) : '',
                    ]
                        .map(esc)
                        .join(',')
                );
            }
            const s = placementCtcSummary;
            lines.push(
                [
                    'total',
                    'ALL',
                    '',
                    totalPlacedStudents,
                    '',
                    s.placementsWithCtc,
                    s.minCtcLpa ?? '',
                    s.maxCtcLpa ?? '',
                    s.averageCtcLpa != null ? s.averageCtcLpa.toFixed(2) : '',
                    s.medianCtcLpa != null ? s.medianCtcLpa.toFixed(2) : '',
                ]
                    .map(esc)
                    .join(',')
            );
            res.header('Content-Type', 'text/csv');
            res.attachment(`analytics_placement_ctc_${year ?? 'all'}.csv`);
            return res.send(lines.join('\n'));
        }

        if (type === 'placement-ctc-total') {
            const { placementCtcSummary, totalPlacedStudents } = await computeBranchPlacementAnalytics(year);
            const s = placementCtcSummary;
            const header = 'metric,value';
            const lines = [
                header,
                `totalPlacedStudents,${totalPlacedStudents}`,
                `placementsWithRecordedCtc,${s.placementsWithCtc}`,
                `minCtcLpa,${s.minCtcLpa ?? ''}`,
                `maxCtcLpa,${s.maxCtcLpa ?? ''}`,
                `averageCtcLpa,${s.averageCtcLpa != null ? s.averageCtcLpa.toFixed(2) : ''}`,
                `medianCtcLpa,${s.medianCtcLpa != null ? s.medianCtcLpa.toFixed(2) : ''}`,
            ];
            res.header('Content-Type', 'text/csv');
            res.attachment(`analytics_placement_ctc_total_${year ?? 'all'}.csv`);
            return res.send(lines.join('\n'));
        }

        if (type === 'company') {
            const data = await getDashboardCompanyData(year);
            const jobs = await prisma.job.findMany({
                where: { status: 'PUBLISHED', ...(year != null ? jobCreatedWhere(year) : {}) },
                select: { companyName: true },
            });
            const jobsPer: Record<string, number> = {};
            for (const j of jobs) {
                const c = j.companyName.trim() || 'Unknown';
                jobsPer[c] = (jobsPer[c] || 0) + 1;
            }
            const placeWh = placementWhere(year);
            const placements = await prisma.placementRecord.findMany({ where: placeWh, select: { companyName: true, ctc: true } });
            const ctcCo: Record<string, number[]> = {};
            for (const p of placements) {
                const c = (p.companyName || 'Unknown').trim();
                const n = parseCtcToNumber(p.ctc);
                if (n != null) {
                    if (!ctcCo[c]) ctcCo[c] = [];
                    ctcCo[c]!.push(n);
                }
            }
            const header = 'companyName,jobsPosted,placements,applications,averageCtcLpa,conversionRatePct';
            const lines = [header];
            for (const row of data) {
                const jp = jobsPer[row.companyName] || 0;
                const ctcs = ctcCo[row.companyName] || [];
                const conv = row.applications > 0 ? Math.round((row.placements / row.applications) * 10000) / 100 : row.placements > 0 ? 100 : 0;
                lines.push(
                    [
                        row.companyName,
                        jp,
                        row.placements,
                        row.applications,
                        mean(ctcs)?.toFixed(2) ?? '',
                        conv,
                    ]
                        .map(esc)
                        .join(',')
                );
            }
            res.header('Content-Type', 'text/csv');
            res.attachment(`analytics_company_${year ?? 'all'}.csv`);
            return res.send(lines.join('\n'));
        }

        // summary
        const o = await computeOverviewPayload(year);
        const header = 'metric,value';
        const lines = [
            header,
            `totalStudents,${o.totalStudents}`,
            `placedStudents,${o.placedStudents}`,
            `placementRatePct,${o.placementRatePct}`,
            `totalJobsPublished,${o.totalJobsPublished}`,
            `totalCompanies,${o.totalCompanies}`,
            `totalApplications,${o.totalApplications}`,
            `averageCtcLpa,${o.averageCtcLpa ?? ''}`,
            `medianCtcLpa,${o.medianCtcLpa ?? ''}`,
            `lockedProfiles,${o.lockedProfiles}`,
            `studentsWithBacklogs,${o.studentsWithBacklogs}`,
        ];
        res.header('Content-Type', 'text/csv');
        res.attachment(`analytics_summary_${year ?? 'all'}.csv`);
        return res.send(lines.join('\n'));
    } catch (e) {
        console.error('[analytics/export-dashboard]', e);
        return res.status(500).json({ success: false, message: 'Export failed.' });
    }
};
