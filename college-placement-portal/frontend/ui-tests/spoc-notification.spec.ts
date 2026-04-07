import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';

const API_BASE = 'http://localhost:5001/api';
const SPOC_EMAIL = 'ui_spoc@example.com';
const SPOC_PASSWORD = 'Password@123';
const DIR = 'verification_screenshots/spoc_module_round3/notifications_trigger';

test.beforeAll(() => {
  fs.mkdirSync(DIR, { recursive: true });
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

async function openPage(page: Page) {
  await page.route('**/api/jobs/job_notify', (route) => {
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        success: true,
        job: {
          id: 'job_notify',
          role: 'Backend Developer',
          companyName: 'NotifyCorp',
          status: 'PUBLISHED',
          stages: [
            { id: 's0', name: 'OA', scheduledDate: '2030-01-01T00:00:00.000Z', status: 'COMPLETED' },
            { id: 's1', name: 'Interview', scheduledDate: '2030-01-02T00:00:00.000Z', status: 'PENDING' }
          ],
          applications: [
            { id: 'a1', student: { id: 'st1', firstName: 'U1', lastName: 'A', scholarNo: 'SCH1', isLocked: false }, status: 'APPLIED', atsScore: 70, currentStageIndex: 0 },
            { id: 'a2', student: { id: 'st2', firstName: 'U2', lastName: 'B', scholarNo: 'SCH2', isLocked: false }, status: 'APPLIED', atsScore: 80, currentStageIndex: 0 }
          ]
        }
      })
    });
  });
  await page.goto('/jobs/job_notify/details', { waitUntil: 'networkidle' });
}

test('valid_case - selected students payload sent', async ({ page }) => {
  await loginAsSpoc(page);
  let body: any = null;
  await page.route('**/api/jobs/job_notify/advance-stage', async (route) => {
    body = route.request().postDataJSON();
    await route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ success: true }) });
  });
  await openPage(page);
  await page.locator('tbody tr', { hasText: 'SCH1' }).first().click();
  await page.getByRole('button', { name: /Move to Next Stage/i }).click();
  expect(body?.selectedIds).toEqual(['st1']);
  await page.screenshot({ path: `${DIR}/valid_case.png`, fullPage: true });
});

test('invalid_case - backend notification transition failure shown', async ({ page }) => {
  await loginAsSpoc(page);
  await page.route('**/api/jobs/job_notify/advance-stage', (route) =>
    route.fulfill({ status: 400, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ success: false, message: 'Invalid nextStageIndex' }) })
  );
  await openPage(page);
  await page.locator('tbody tr').first().click();
  await page.getByRole('button', { name: /Move to Next Stage/i }).click();
  await expect(page.getByText(/Invalid nextStageIndex/i)).toBeVisible();
  await page.screenshot({ path: `${DIR}/invalid_case.png`, fullPage: true });
});

test('edge_case - empty selection prevents notification trigger', async ({ page }) => {
  await loginAsSpoc(page);
  await openPage(page);
  await expect(page.getByRole('button', { name: /Move to Next Stage/i })).toHaveCount(0);
  await page.screenshot({ path: `${DIR}/edge_case.png`, fullPage: true });
});

test('ui_state - notification trigger action bar visible', async ({ page }) => {
  await loginAsSpoc(page);
  await openPage(page);
  await page.locator('tbody tr').first().click();
  await expect(page.getByText(/student\(s\) selected/i)).toBeVisible();
  await page.screenshot({ path: `${DIR}/ui_state.png`, fullPage: true });
});

