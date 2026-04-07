import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const STUDENT_EMAIL = 'ui_student@example.com';
const STUDENT_PASSWORD = 'Password@123';
const API_BASE = 'http://localhost:5001/api';

const SHOTS_BASE = 'verification_screenshots/job_board_fix';
const API_SUCCESS_DIR = `${SHOTS_BASE}/api_success`;
const JOBS_VISIBLE_DIR = `${SHOTS_BASE}/jobs_visible`;
const NO_ERROR_DIR = `${SHOTS_BASE}/no_error`;
const EDGE_CASES_DIR = `${SHOTS_BASE}/edge_cases`;

test.beforeAll(() => {
  fs.mkdirSync(API_SUCCESS_DIR, { recursive: true });
  fs.mkdirSync(JOBS_VISIBLE_DIR, { recursive: true });
  fs.mkdirSync(NO_ERROR_DIR, { recursive: true });
  fs.mkdirSync(EDGE_CASES_DIR, { recursive: true });
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

function getPublishedJobsPayload() {
  return {
    success: true,
    jobs: [
      {
        id: 'job_1',
        role: 'Frontend Engineer',
        companyName: 'TCS',
        description: 'React and TypeScript role',
        jobType: 'Full-Time',
        ctc: '10',
        cgpaMin: 7,
        eligibleBranches: ['CSE', 'ECE'],
        requiredProfileFields: ['resume'],
        customQuestions: [],
        applicationDeadline: '2030-12-31T00:00:00.000Z',
        status: 'PUBLISHED',
      },
    ],
  };
}

async function mockCommonJobBoardApis(page: import('@playwright/test').Page, jobsPayload: any) {
  await page.route('**/api/jobs', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(jobsPayload),
    })
  );

  await page.route('**/api/applications', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ success: true, applications: [] }),
    })
  );

  await page.route('**/api/student/profile', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ success: true, data: { isLocked: false, lockedReason: '' } }),
    })
  );

  await page.route('**/api/student/resumes', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ success: true, data: [] }),
    })
  );
}

test.describe('Student Job Board API/visibility', () => {
  test('api_success and jobs_visible', async ({ page }) => {
    await loginAsStudent(page);
    await mockCommonJobBoardApis(page, getPublishedJobsPayload());

    await page.goto('/job-board', { waitUntil: 'networkidle' });
    await expect(page.getByTestId('job-card')).toHaveCount(1);
    await expect(page.getByText('Frontend Engineer')).toBeVisible();
    await expect(page.getByText('TCS')).toBeVisible();

    await page.screenshot({ path: `${API_SUCCESS_DIR}/valid_case.png`, fullPage: true });
    await page.screenshot({ path: `${JOBS_VISIBLE_DIR}/valid_case.png`, fullPage: true });
  });

  test('no_error on applications fetch', async ({ page }) => {
    await loginAsStudent(page);
    await mockCommonJobBoardApis(page, getPublishedJobsPayload());

    await page.goto('/job-board', { waitUntil: 'networkidle' });
    await expect(page.getByText('Failed to fetch applications')).toHaveCount(0);
    await expect(page.getByText('Failed to load data')).toHaveCount(0);

    await page.screenshot({ path: `${NO_ERROR_DIR}/valid_case.png`, fullPage: true });
  });

  test('edge_cases: empty published jobs payload', async ({ page }) => {
    await loginAsStudent(page);
    await mockCommonJobBoardApis(page, { success: true, jobs: [] });

    await page.goto('/job-board', { waitUntil: 'networkidle' });
    await expect(page.getByText('No roles found')).toBeVisible();
    await expect(page.getByText(/No currently open published jobs/i)).toBeVisible();

    await page.screenshot({ path: `${EDGE_CASES_DIR}/empty_jobs.png`, fullPage: true });
  });
});

