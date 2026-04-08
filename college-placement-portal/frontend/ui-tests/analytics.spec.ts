import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const ROOT = 'verification_screenshots/analytics_final';
for (const d of ['overview', 'trends', 'branch', 'placement-ctc', 'company', 'ctc']) {
  fs.mkdirSync(`${ROOT}/${d}`, { recursive: true });
}

const mockPayloads = {
  overview: {
    success: true,
    year: 'all',
    overview: {
      totalStudents: 120,
      placedStudents: 72,
      placementRatePct: 60,
      totalJobsPublished: 18,
      totalCompanies: 9,
      totalApplications: 340,
      averageCtcLpa: 8.4,
      medianCtcLpa: 7.8,
      lockedProfiles: 12,
      studentsWithBacklogs: 8,
    },
  },
  trends: {
    success: true,
    year: 'all',
    trends: [
      { year: 2022, placedStudents: 40, jobsPosted: 10, applications: 100 },
      { year: 2023, placedStudents: 55, jobsPosted: 14, applications: 210 },
      { year: 2024, placedStudents: 72, jobsPosted: 18, applications: 340 },
    ],
  },
  branch: {
    success: true,
    year: 'all',
    totalPlacedStudents: 60,
    placementCtcSummary: {
      placementsWithCtc: 55,
      minCtcLpa: 3.2,
      maxCtcLpa: 18.5,
      averageCtcLpa: 8.45,
      medianCtcLpa: 7.9,
    },
    branches: [
      {
        branch: 'CSE',
        totalStudents: 60,
        placedStudents: 40,
        placementRatePct: 66.67,
        placementsWithCtc: 38,
        minCtcLpa: 4.5,
        maxCtcLpa: 18.5,
        averageCtcLpa: 9.2,
        medianCtcLpa: 8.8,
      },
      {
        branch: 'ECE',
        totalStudents: 40,
        placedStudents: 20,
        placementRatePct: 50,
        placementsWithCtc: 17,
        minCtcLpa: 3.2,
        maxCtcLpa: 12,
        averageCtcLpa: 7.1,
        medianCtcLpa: 6.9,
      },
    ],
  },
  company: {
    success: true,
    year: 'all',
    companies: [
      {
        companyName: 'Acme Corp',
        jobsPosted: 3,
        placements: 15,
        applications: 80,
        averageCtcLpa: 9.5,
        conversionRatePct: 18.75,
      },
      {
        companyName: 'Beta Ltd',
        jobsPosted: 2,
        placements: 8,
        applications: 60,
        averageCtcLpa: 7.2,
        conversionRatePct: 13.33,
      },
    ],
  },
  ctc: {
    success: true,
    year: 'all',
    distribution: [
      { bucket: '<3 LPA', count: 5 },
      { bucket: '3–6 LPA', count: 20 },
      { bucket: '6–10 LPA', count: 35 },
      { bucket: '10–15 LPA', count: 10 },
      { bucket: '15+ LPA', count: 2 },
    ],
    stats: { count: 72, averageLpa: 8.4, medianLpa: 7.8, maxLpa: 18.5 },
  },
};

/** Avoid brittle login UI selectors; mirror real auth (token + /api/auth/me). */
async function seedSpocSession(page: import('@playwright/test').Page) {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { id: 'playwright-spoc', email: 'spoc@example.com', role: 'SPOC' },
      }),
    });
  });
  await page.addInitScript(() => {
    localStorage.setItem('token', 'playwright-analytics-token');
  });
}

async function fulfillAnalytics(route: import('@playwright/test').Route, yearSuffix: string) {
  const u = route.request().url();
  const path = u.split('/api/analytics/')[1]?.split('?')[0] ?? '';
  const map: Record<string, unknown> = {
    overview: { ...mockPayloads.overview, year: yearSuffix },
    trends: { ...mockPayloads.trends, year: yearSuffix },
    branch: { ...mockPayloads.branch, year: yearSuffix },
    company: { ...mockPayloads.company, year: yearSuffix },
    ctc: { ...mockPayloads.ctc, year: yearSuffix },
  };
  const body = map[path];
  if (!body) return route.continue();
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

test.describe('Placement analytics dashboard', () => {
  test('renders all sections from APIs and year filter refetches', async ({ page }) => {
    await page.route(/\/api\/analytics\//, async (route) => {
      const u = route.request().url();
      const m = u.match(/[?&]year=(\d{4})/);
      const y = m ? m[1]! : 'all';
      await fulfillAnalytics(route, y);
    });

    await seedSpocSession(page);
    await page.goto('/analytics', { waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('analytics-dashboard-page')).toBeVisible();
    await expect(page.getByText('Placement command center')).toBeVisible();
    await expect(page.getByTestId('analytics-kpi-section')).toBeVisible();
    await expect(page.getByText('120')).toBeVisible();
    await expect(page.getByText('Placement trends')).toBeVisible();
    await expect(page.getByText('Branch intelligence')).toBeVisible();
    await expect(page.getByText('Placement package by branch')).toBeVisible();
    await expect(page.getByText('Company intelligence')).toBeVisible();
    await expect(page.getByText('CTC distribution')).toBeVisible();
    await expect(page.getByTestId('analytics-export-summary')).toBeVisible();

    await page.screenshot({ path: `${ROOT}/overview/loaded.png`, fullPage: true });
    await page.locator('[data-testid="analytics-trends-section"]').screenshot({ path: `${ROOT}/trends/chart.png` });
    await page.locator('[data-testid="analytics-branch-section"]').screenshot({ path: `${ROOT}/branch/chart.png` });
    await page.locator('[data-testid="analytics-placement-ctc-section"]').screenshot({ path: `${ROOT}/placement-ctc/chart.png` });
    await page.locator('[data-testid="analytics-company-section"]').screenshot({ path: `${ROOT}/company/chart.png` });
    await page.locator('[data-testid="analytics-ctc-section"]').screenshot({ path: `${ROOT}/ctc/chart.png` });

    const overview2024 = page.waitForResponse(
      (r) => r.url().includes('/api/analytics/overview') && r.url().includes('year=2024') && r.ok()
    );
    await page.getByTestId('analytics-year-filter').selectOption('2024');
    await overview2024;
    await expect(page.getByTestId('analytics-dashboard-page')).toBeVisible();
  });

  test('empty analytics responses do not crash UI', async ({ page }) => {
    await page.route(/\/api\/analytics\//, async (route) => {
      const path = route.request().url().split('/api/analytics/')[1]?.split('?')[0] ?? '';
      const empty: Record<string, () => unknown> = {
        overview: () => ({ success: true, year: 'all', overview: null }),
        trends: () => ({ success: true, year: 'all', trends: [] }),
        branch: () => ({
          success: true,
          year: 'all',
          branches: [],
          totalPlacedStudents: 0,
          placementCtcSummary: {
            placementsWithCtc: 0,
            minCtcLpa: null,
            maxCtcLpa: null,
            averageCtcLpa: null,
            medianCtcLpa: null,
          },
        }),
        company: () => ({ success: true, year: 'all', companies: [] }),
        ctc: () => ({
          success: true,
          year: 'all',
          distribution: [
            { bucket: '<3 LPA', count: 0 },
            { bucket: '3–6 LPA', count: 0 },
            { bucket: '6–10 LPA', count: 0 },
            { bucket: '10–15 LPA', count: 0 },
            { bucket: '15+ LPA', count: 0 },
          ],
          stats: { count: 0, averageLpa: null, medianLpa: null, maxLpa: null },
        }),
      };
      const fn = empty[path];
      if (!fn) return route.continue();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fn()) });
    });

    await seedSpocSession(page);
    await page.goto('/analytics', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('analytics-dashboard-page')).toBeVisible();
    await expect(page.getByText('No trend data for this filter.')).toBeVisible();
    await expect(page.getByText('No branch data for this year filter.')).toBeVisible();
    await expect(page.getByText('No branch-level CTC data for this filter.')).toBeVisible();
    await expect(page.getByText('No company activity for this filter.')).toBeVisible();
    await expect(page.getByText('No CTC data for this filter.')).toBeVisible();
    await expect(page.getByText('No overview data.')).toBeVisible();
  });
});
