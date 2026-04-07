import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const STUDENT_EMAIL = 'ui_student@example.com';
const STUDENT_PASSWORD = 'Password@123';
const API_BASE = 'http://localhost:5001/api';

const DASHBOARD_DIR = 'verification_screenshots/student_module/dashboard_cards';

test.beforeAll(() => {
  fs.mkdirSync(DASHBOARD_DIR, { recursive: true });
});

async function loginAsStudent(page: import('@playwright/test').Page) {
  const seedRes = await page.request.get(`${API_BASE}/seed/seed-ui`);
  expect(seedRes.ok()).toBeTruthy();
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').waitFor({ state: 'visible', timeout: 15000 });
  await page.getByPlaceholder('you@example.com').fill(STUDENT_EMAIL);
  await page.getByPlaceholder('Enter your password').fill(STUDENT_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
}

const stageNames = [
  'Job Posted',
  'Application Opened',
  'Applied',
  'Under Review',
  'Shortlisted',
  'Interview Scheduled',
  'Interview Completed',
  'Selected',
  'Offered',
  'Placed / Rejected',
];

function timelineFor(outcome: string) {
  return stageNames.map((stage, idx) => {
    const marker = idx < 9 ? 'completed' : 'current';
    return {
      stage,
      date: `2030-0${idx + 1}-01T00:00:00.000Z`,
      status: marker,
      ...(idx === 9 ? { outcome } : {}),
    };
  });
}

test.describe('Student Dashboard cards', () => {
  test('valid_case (Jobs Offered present, Interviews card removed)', async ({ page }) => {
    await loginAsStudent(page);

    await page.route('**/api/applications', async (route) => {
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          success: true,
          stats: { appliedJobs: 5, jobsOffered: 3, shortlisted: 2, profileLocked: false },
          applications: [
            {
              id: 'app1',
              status: 'ACCEPTED',
              appliedAt: '2030-04-01T00:00:00.000Z',
              createdAt: '2030-04-01T00:00:00.000Z',
              job: { role: 'Role', companyName: 'Comp', stages: [], createdAt: '2030-03-01T00:00:00.000Z' },
              timeline: timelineFor('Placed'),
            },
          ],
        }),
      });
    });

    await page.goto('/dashboard', { waitUntil: 'networkidle' });

    await expect(page.getByText('Jobs Offered')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('span.text-sm.font-medium.text-gray-500', { hasText: 'Shortlisted' })).toHaveCount(0);
    await expect(page.locator('span.text-sm.font-medium.text-gray-500', { hasText: 'Profile Status' })).toHaveCount(0);
    await expect(page.getByText('Interviews')).toHaveCount(0);

    await page.screenshot({ path: `${DASHBOARD_DIR}/valid_case.png` });
    await page.screenshot({ path: `${DASHBOARD_DIR}/ui_state.png` });
  });

  test('invalid_case (timeline missing; UI still renders cards)', async ({ page }) => {
    await loginAsStudent(page);

    await page.route('**/api/applications', async (route) => {
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          success: true,
          stats: { appliedJobs: 1, jobsOffered: 0, shortlisted: 0, profileLocked: true },
          applications: [
            {
              id: 'app1',
              status: 'APPLIED',
              appliedAt: '2030-04-01T00:00:00.000Z',
              createdAt: '2030-04-01T00:00:00.000Z',
              job: { role: 'Role', companyName: 'Comp', stages: [], createdAt: '2030-03-01T00:00:00.000Z' },
              timeline: [],
            },
          ],
        }),
      });
    });

    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    await expect(page.getByText('Jobs Offered')).toBeVisible();
    await expect(page.getByTestId('timeline-drawer')).toHaveCount(0);
    await expect(page.getByText('Timeline not available')).toHaveCount(0);
    await expect(page.locator('span.text-sm.font-medium.text-gray-500', { hasText: 'Shortlisted' })).toHaveCount(0);
    await expect(page.locator('span.text-sm.font-medium.text-gray-500', { hasText: 'Profile Status' })).toHaveCount(0);
    await expect(page.getByText('Interviews')).toHaveCount(0);

    // Timeline should appear only after selecting an application
    await page.getByTestId('application-card').first().click();
    await expect(page.getByTestId('timeline-drawer')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Timeline not available')).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: `${DASHBOARD_DIR}/invalid_case.png` });
  });

  test('edge_case (0 offered jobs)', async ({ page }) => {
    await loginAsStudent(page);

    await page.route('**/api/applications', async (route) => {
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          success: true,
          stats: { appliedJobs: 4, jobsOffered: 0, shortlisted: 1, profileLocked: false },
          applications: [
            {
              id: 'app1',
              status: 'SHORTLISTED',
              appliedAt: '2030-04-01T00:00:00.000Z',
              createdAt: '2030-04-01T00:00:00.000Z',
              job: { role: 'Role', companyName: 'Comp', stages: [], createdAt: '2030-03-01T00:00:00.000Z' },
              timeline: stageNames.map((stage, idx) => ({
                stage,
                date: `2030-0${idx + 1}-01T00:00:00.000Z`,
                status: idx < 4 ? 'completed' : idx === 4 ? 'current' : 'pending',
              })),
            },
          ],
        }),
      });
    });

    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    await expect(page.getByText('Jobs Offered')).toBeVisible();
    await expect(page.locator('span.text-sm.font-medium.text-gray-500', { hasText: 'Shortlisted' })).toHaveCount(0);
    await expect(page.getByText('Interviews')).toHaveCount(0);
    await page.screenshot({ path: `${DASHBOARD_DIR}/edge_case.png` });
  });
});

