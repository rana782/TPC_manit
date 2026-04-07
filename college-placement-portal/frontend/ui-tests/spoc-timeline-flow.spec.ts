import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';

const API_BASE = 'http://localhost:5001/api';
const SPOC_EMAIL = 'ui_spoc@example.com';
const SPOC_PASSWORD = 'Password@123';
const ROOT_DIR = 'verification_screenshots/spoc_module_round3';
const TIMELINE_DIR = `${ROOT_DIR}/timeline_stage_progression`;
const SELECTION_DIR = `${ROOT_DIR}/student_selection_flow`;

const baseJobPayload = {
  success: true,
  job: {
    id: 'job_round3',
    role: 'Software Engineer',
    companyName: 'InnovateTech',
    status: 'PUBLISHED',
    ctc: '12',
    applicationDeadline: '2030-01-01T00:00:00.000Z',
    stages: [
      { id: 'st0', name: 'OA', scheduledDate: '2030-01-10T00:00:00.000Z', status: 'COMPLETED' },
      { id: 'st1', name: 'Technical', scheduledDate: '2030-01-15T00:00:00.000Z', status: 'PENDING' },
      { id: 'st2', name: 'HR', scheduledDate: '2030-01-20T00:00:00.000Z', status: 'PENDING' }
    ]
  }
};

test.beforeAll(() => {
  fs.mkdirSync(TIMELINE_DIR, { recursive: true });
  fs.mkdirSync(SELECTION_DIR, { recursive: true });
});

async function loginAsSpoc(page: Page) {
  const seedRes = await page.request.get(`${API_BASE}/seed/seed-ui`);
  expect(seedRes.ok()).toBeTruthy();
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').fill(SPOC_EMAIL);
  await page.getByPlaceholder('Enter your password').fill(SPOC_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/jobs-management/, { timeout: 15000 });
}

async function openRound3Details(page: Page, applications: any[]) {
  await page.route('**/api/jobs/job_round3', (route) => {
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...baseJobPayload,
        job: { ...baseJobPayload.job, applications }
      })
    });
  });
  await page.goto('/jobs/job_round3/details', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('job-details-page')).toBeVisible({ timeout: 10000 });
}

test('valid_case - move to next stage for selected students', async ({ page }) => {
  await loginAsSpoc(page);
  await page.route('**/api/jobs/job_round3/advance-stage', (route) =>
    route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ success: true }) })
  );
  await openRound3Details(page, [
    { id: 'a1', student: { id: 's1', firstName: 'A', lastName: 'One', scholarNo: 'SC1', isLocked: false }, status: 'APPLIED', atsScore: 80, currentStageIndex: 0 },
    { id: 'a2', student: { id: 's2', firstName: 'B', lastName: 'Two', scholarNo: 'SC2', isLocked: false }, status: 'APPLIED', atsScore: 72, currentStageIndex: 0 }
  ]);

  await page.locator('tbody tr').first().click();
  await expect(page.getByText(/Move to Next Stage/i)).toBeVisible();
  await page.getByRole('button', { name: /Move to Next Stage/i }).click();
  await expect(page.getByText(/moved to next stage/i)).toBeVisible();

  await page.screenshot({ path: `${TIMELINE_DIR}/valid_case.png`, fullPage: true });
  await page.screenshot({ path: `${SELECTION_DIR}/valid_case.png`, fullPage: true });
});

test('invalid_case - mixed stage selection blocked', async ({ page }) => {
  await loginAsSpoc(page);
  await openRound3Details(page, [
    { id: 'a1', student: { id: 's1', firstName: 'A', lastName: 'One', scholarNo: 'SC1', isLocked: false }, status: 'APPLIED', atsScore: 80, currentStageIndex: 0 },
    { id: 'a2', student: { id: 's2', firstName: 'B', lastName: 'Two', scholarNo: 'SC2', isLocked: false }, status: 'APPLIED', atsScore: 72, currentStageIndex: 1 }
  ]);
  await page.locator('tbody tr').nth(0).click();
  await page.locator('tbody tr').nth(1).click();

  await expect(page.getByText(/mixed stages/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Move to Next Stage/i })).toHaveCount(0);

  await page.screenshot({ path: `${TIMELINE_DIR}/invalid_case.png`, fullPage: true });
  await page.screenshot({ path: `${SELECTION_DIR}/invalid_case.png`, fullPage: true });
});

test('edge_case - final stage selection shows declare placed', async ({ page }) => {
  await loginAsSpoc(page);
  await openRound3Details(page, [
    { id: 'a1', student: { id: 's1', firstName: 'A', lastName: 'One', scholarNo: 'SC1', isLocked: false }, status: 'APPLIED', atsScore: 80, currentStageIndex: 2 }
  ]);
  await page.locator('tbody tr').first().click();
  await expect(page.getByRole('button', { name: /Declare Placed/i })).toBeVisible();

  await page.screenshot({ path: `${TIMELINE_DIR}/edge_case.png`, fullPage: true });
  await page.screenshot({ path: `${SELECTION_DIR}/edge_case.png`, fullPage: true });
});

test('ui_state - timeline and selection controls visible', async ({ page }) => {
  await loginAsSpoc(page);
  await openRound3Details(page, [
    { id: 'a1', student: { id: 's1', firstName: 'A', lastName: 'One', scholarNo: 'SC1', isLocked: false }, status: 'APPLIED', atsScore: 80, currentStageIndex: 0 }
  ]);
  await expect(page.getByText('Job Timeline')).toBeVisible();
  await expect(page.getByTestId('applicant-table')).toBeVisible();

  await page.screenshot({ path: `${TIMELINE_DIR}/ui_state.png`, fullPage: true });
  await page.screenshot({ path: `${SELECTION_DIR}/ui_state.png`, fullPage: true });
});

