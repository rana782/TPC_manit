import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';

const API_BASE = 'http://localhost:5001/api';
const DIR = 'verification_screenshots/spoc_module_round3/company_rating_display';
const STUDENT_EMAIL = 'ui_student@example.com';
const SPOC_EMAIL = 'ui_spoc@example.com';
const PASSWORD = 'Password@123';

test.beforeAll(() => {
  fs.mkdirSync(DIR, { recursive: true });
});

async function seedAndLogin(page: Page, email: string, targetRegex: RegExp) {
  const seedRes = await page.request.get(`${API_BASE}/seed/seed-ui`);
  expect(seedRes.ok()).toBeTruthy();
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('Enter your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(targetRegex, { timeout: 15000 });
}

function mockCommonStudentApis(page: Page) {
  page.route('**/api/student/resumes', (route) => route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ success: true, data: [] }) }));
  page.route('**/api/applications', (route) => route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ success: true, applications: [] }) }));
  page.route('**/api/student/profile', (route) => route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ success: true, data: { isLocked: false } }) }));
}

function jobsPayload() {
  return {
    success: true,
    jobs: [{
      id: 'job_rate',
      role: 'Frontend Engineer',
      companyName: 'TCS',
      description: 'Role',
      jobType: 'Full-Time',
      ctc: '10',
      cgpaMin: 7,
      eligibleBranches: '["CSE"]',
      requiredProfileFields: '["resume"]',
      customQuestions: '[]',
      applicationDeadline: '2030-01-01T00:00:00.000Z',
      status: 'PUBLISHED',
      _count: { applications: 2 }
    }]
  };
}

test('valid_case - rating displayed on student job board', async ({ page }) => {
  await seedAndLogin(page, STUDENT_EMAIL, /\/dashboard/);
  mockCommonStudentApis(page);
  await page.route('**/api/jobs', (route) => route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(jobsPayload()) }));
  await page.route('**/api/companies/lookup?name=*', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        found: true,
        rating: 4.2,
        reviews: 1000,
        logoUrl: null,
        highlyRatedFor: [],
        criticallyRatedFor: []
      })
    })
  );

  await page.goto('/job-board', { waitUntil: 'networkidle' });
  await expect(page.getByText('4.2/5')).toBeVisible();
  await page.screenshot({ path: `${DIR}/valid_case.png`, fullPage: true });
});

test('invalid_case - API failure falls back to rating not available', async ({ page }) => {
  await seedAndLogin(page, STUDENT_EMAIL, /\/dashboard/);
  mockCommonStudentApis(page);
  await page.route('**/api/jobs', (route) => route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(jobsPayload()) }));
  await page.route('**/api/companies/lookup?name=*', (route) =>
    route.fulfill({ status: 500, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ success: false }) })
  );

  await page.goto('/job-board', { waitUntil: 'networkidle' });
  await expect(page.getByText(/Rating not available/i)).toBeVisible();
  await page.screenshot({ path: `${DIR}/invalid_case.png`, fullPage: true });
});

test('edge_case - null rating falls back correctly', async ({ page }) => {
  await seedAndLogin(page, STUDENT_EMAIL, /\/dashboard/);
  mockCommonStudentApis(page);
  await page.route('**/api/jobs', (route) => route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(jobsPayload()) }));
  await page.route('**/api/companies/lookup?name=*', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        found: false,
        rating: null,
        reviews: null,
        logoUrl: null,
        highlyRatedFor: [],
        criticallyRatedFor: []
      })
    })
  );

  await page.goto('/job-board', { waitUntil: 'networkidle' });
  await expect(page.getByText(/Rating not available/i)).toBeVisible();
  await page.screenshot({ path: `${DIR}/edge_case.png`, fullPage: true });
});

test('ui_state - rating visible in spoc job cards', async ({ page }) => {
  await seedAndLogin(page, SPOC_EMAIL, /\/jobs-management/);
  await page.route('**/api/jobs', (route) => route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(jobsPayload()) }));
  await page.route('**/api/companies/lookup?name=*', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        found: true,
        rating: 3.9,
        reviews: 80000,
        logoUrl: null,
        highlyRatedFor: [],
        criticallyRatedFor: []
      })
    })
  );

  await page.goto('/jobs-management', { waitUntil: 'networkidle' });
  await expect(page.getByText('3.9/5')).toBeVisible();
  await page.screenshot({ path: `${DIR}/ui_state.png`, fullPage: true });
});

