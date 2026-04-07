import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';

const API_BASE = 'http://localhost:5001/api';
const SPOC_EMAIL = 'ui_spoc@example.com';
const SPOC_PASSWORD = 'Password@123';
const DECLARE_DIR = 'verification_screenshots/spoc_module_round3/declare_placed';
const LOCK_DIR = 'verification_screenshots/spoc_module_round3/lock_option_removed';

test.beforeAll(() => {
  fs.mkdirSync(DECLARE_DIR, { recursive: true });
  fs.mkdirSync(LOCK_DIR, { recursive: true });
});

async function loginAsSpoc(page: Page) {
  let seeded = false;
  for (let i = 0; i < 3; i += 1) {
    try {
      const seedRes = await page.request.get(`${API_BASE}/seed/seed-ui`);
      if (seedRes.ok()) {
        seeded = true;
        break;
      }
    } catch {
      // retry transient backend reset
    }
  }
  expect(seeded).toBeTruthy();
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').fill(SPOC_EMAIL);
  await page.getByPlaceholder('Enter your password').fill(SPOC_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/jobs-management/, { timeout: 15000 });
}

async function openPlacementPage(page: Page, stageIndex: number) {
  await page.route('**/api/jobs/job_place', (route) => {
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        success: true,
        job: {
          id: 'job_place',
          role: 'SDE',
          companyName: 'PlaceCorp',
          status: 'PUBLISHED',
          stages: [
            { id: 's0', name: 'OA', scheduledDate: '2030-01-01T00:00:00.000Z', status: 'COMPLETED' },
            { id: 's1', name: 'Interview', scheduledDate: '2030-01-02T00:00:00.000Z', status: 'COMPLETED' }
          ],
          applications: [
            { id: 'a1', student: { id: 'st1', firstName: 'U1', lastName: 'A', scholarNo: 'SCH1', isLocked: false }, status: 'APPLIED', atsScore: 71, currentStageIndex: stageIndex }
          ]
        }
      })
    });
  });
  await page.goto('/jobs/job_place/details', { waitUntil: 'networkidle' });
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${DECLARE_DIR}/${name}.png`, fullPage: true });
  await page.screenshot({ path: `${LOCK_DIR}/${name}.png`, fullPage: true });
}

test('valid_case - declare placed at final stage', async ({ page }) => {
  await loginAsSpoc(page);
  await page.route('**/api/jobs/job_place/results', (route) =>
    route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ success: true }) })
  );
  await openPlacementPage(page, 1);
  await page.locator('tbody tr').first().click();
  await page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: /Declare Placed/i }).click();
  await expect(page.getByText(/declared as placed/i)).toBeVisible();
  await shot(page, 'valid_case');
});

test('invalid_case - declare placed blocked by backend', async ({ page }) => {
  await loginAsSpoc(page);
  await page.route('**/api/jobs/job_place/results', (route) =>
    route.fulfill({ status: 400, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ success: false, message: 'Declare placed is allowed only for students in final stage' }) })
  );
  await openPlacementPage(page, 1);
  await page.locator('tbody tr').first().click();
  await page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: /Declare Placed/i }).click();
  await expect(page.getByText(/allowed only for students in final stage/i)).toBeVisible();
  await shot(page, 'invalid_case');
});

test('edge_case - non-final stage does not show declare placed', async ({ page }) => {
  await loginAsSpoc(page);
  await openPlacementPage(page, 0);
  await page.locator('tbody tr').first().click();
  await expect(page.getByRole('button', { name: /Declare Placed/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Move to Next Stage/i })).toBeVisible();
  await shot(page, 'edge_case');
});

test('ui_state - lock modal has only lock/unlock actions', async ({ page }) => {
  await loginAsSpoc(page);
  await openPlacementPage(page, 1);
  await page.getByRole('button', { name: /Lock Profile/i }).first().click();
  const lockModal = page.locator('form').filter({ hasText: 'Reason (Optional)' }).first();
  await expect(page.getByText(/Lock Type/i)).toHaveCount(0);
  await expect(lockModal.getByRole('button', { name: /^Lock Profile$/i })).toBeVisible();
  await shot(page, 'ui_state');
});

