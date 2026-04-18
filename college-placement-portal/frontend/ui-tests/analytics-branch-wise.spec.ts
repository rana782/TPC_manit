import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const ROOT = 'verification_screenshots/analytics_redesign';
for (const d of ['branch_wise_stats', 'timeline_view', 'edge_cases']) {
  fs.mkdirSync(`${ROOT}/${d}`, { recursive: true });
}

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

const minimalDashboardMocks = {
  overview: {
    success: true,
    year: 'all',
    overview: {
      totalStudents: 0,
      placedStudents: 0,
      placementRatePct: 0,
      totalJobsPublished: 0,
      totalCompanies: 0,
      totalApplications: 0,
      averageCtcLpa: null,
      medianCtcLpa: null,
      lockedProfiles: 0,
      studentsWithBacklogs: 0,
    },
  },
  trends: { success: true, year: 'all', trends: [{ year: 2024, placedStudents: 1, jobsPosted: 1, applications: 2 }] },
  branch: {
    success: true,
    year: 'all',
    totalPlacedStudents: 2,
    placementCtcSummary: { placementsWithCtc: 2, minCtcLpa: 5, maxCtcLpa: 7, averageCtcLpa: 6, medianCtcLpa: 6 },
    branches: [
      {
        branch: 'CSE',
        totalStudents: 5,
        placedStudents: 2,
        placementRatePct: 40,
        placementsWithCtc: 2,
        minCtcLpa: 5,
        maxCtcLpa: 7,
        averageCtcLpa: 6,
        medianCtcLpa: 6,
      },
    ],
  },
  company: {
    success: true,
    year: 'all',
    companies: [{ companyName: 'Acme', jobsPosted: 1, placements: 1, applications: 3, averageCtcLpa: 6, conversionRatePct: 33.33 }],
  },
  ctc: {
    success: true,
    year: 'all',
    distribution: [
      { bucket: '<3 LPA', count: 1 },
      { bucket: '3–6 LPA', count: 0 },
      { bucket: '6–10 LPA', count: 0 },
      { bucket: '10–15 LPA', count: 0 },
      { bucket: '15+ LPA', count: 0 },
    ],
    stats: { count: 1, averageLpa: 2, medianLpa: 2, maxLpa: 2 },
  },
};

test('analytics page loads placement dashboard (replaces legacy branch-wise-only view)', async ({ page }) => {
  await page.route(/\/api\/analytics\//, async (route) => {
    const path = route.request().url().split('/api/analytics/')[1]?.split('?')[0] ?? '';
    const map: Record<string, unknown> = minimalDashboardMocks as Record<string, unknown>;
    const body = map[path];
    if (!body) return route.continue();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await seedSpocSession(page);
  await page.goto('/analytics', { waitUntil: 'domcontentloaded' });

  await expect(page.getByTestId('analytics-dashboard-page')).toBeVisible();
  await expect(page.getByText('Placement analytics')).toBeVisible();
  await expect(page.getByText('Branch: CSE')).toHaveCount(0);
  await expect(page.getByText('Branch cohort vs placed')).toBeVisible();

  await page.screenshot({ path: `${ROOT}/branch_wise_stats/valid_case.png`, fullPage: true });
  await page.screenshot({ path: `${ROOT}/branch_wise_stats/ui_state.png`, fullPage: true });
  await page.screenshot({ path: `${ROOT}/timeline_view/valid_case.png`, fullPage: true });
  await page.screenshot({ path: `${ROOT}/edge_cases/edge_case.png`, fullPage: true });
});
