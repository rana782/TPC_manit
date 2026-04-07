import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const API_BASE = 'http://localhost:5001/api';
const SPOC_EMAIL = 'ui_spoc@example.com';
const PASSWORD = 'Password@123';

const ROOT = 'verification_screenshots/manage_job_publish_fix';
const EDIT_DIR = `${ROOT}/edit_published_job`;
const SUCCESS_DIR = `${ROOT}/republish_success`;
const FAIL_DIR = `${ROOT}/republish_failure`;
const EDGE_DIR = `${ROOT}/edge_cases`;

async function login(page: import('@playwright/test').Page, email: string) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('Enter your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

async function enableBackendProxy(page: import('@playwright/test').Page) {
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const response = await page.request.fetch(`http://localhost:5001${u.pathname}${u.search}`, {
      method: req.method(),
      headers: req.headers(),
      data: req.postDataBuffer() ?? undefined
    });
    await route.fulfill({ status: response.status(), headers: response.headers(), body: await response.body() });
  });
}

test.beforeAll(() => {
  [EDIT_DIR, SUCCESS_DIR, FAIL_DIR, EDGE_DIR].forEach((d) => fs.mkdirSync(d, { recursive: true }));
});

test('spoc can edit published job and republish', async ({ page }) => {
  const seedRes = await page.request.get(`${API_BASE}/seed/seed-ui`);
  expect(seedRes.ok()).toBeTruthy();
  await enableBackendProxy(page);

  const suffix = Date.now().toString().slice(-6);
  const role = `Republish SPOC ${suffix}`;
  const updatedRole = `Republish SPOC Updated ${suffix}`;

  await login(page, SPOC_EMAIL);
  await expect(page).toHaveURL(/\/jobs-management/, { timeout: 20000 });
  await page.getByRole('button', { name: /post new job/i }).click();
  const form = page.locator('form#jobForm');
  await form.locator('input[type="text"]').nth(0).fill('RepublishCorp');
  await form.locator('input[type="text"]').nth(1).fill(role);
  await page.getByPlaceholder('e.g. 12 LPA').fill('11 LPA');
  await form.locator('textarea').first().fill('Initial description for published job.');
  const d = new Date();
  d.setDate(d.getDate() + 15);
  await page.locator('input[type="date"]').first().fill(d.toISOString().split('T')[0]);
  await form.locator('input[type="number"]').first().fill('6');
  await page.getByRole('button', { name: /save job posting/i }).click();
  await expect(page.getByText(role)).toBeVisible({ timeout: 20000 });

  const row = page.locator('[data-testid="spoc-job-card"]').filter({ hasText: role }).first();
  await row.locator('button[title="Edit"]').click();
  await expect(page.getByText(/Edit Job Posting/i)).toBeVisible();
  await page.screenshot({ path: `${EDIT_DIR}/valid_case.png`, fullPage: true });
  await page.screenshot({ path: `${EDIT_DIR}/ui_state.png`, fullPage: true });

  await page.locator('form#jobForm input[type="text"]').nth(1).fill(updatedRole);
  await page.getByRole('button', { name: /update & publish/i }).click();
  await expect(page.getByText(updatedRole)).toBeVisible({ timeout: 20000 });
  await expect(page.locator('[data-testid="spoc-job-card"]').filter({ hasText: updatedRole }).getByText('PUBLISHED')).toBeVisible();
  await page.screenshot({ path: `${SUCCESS_DIR}/valid_case.png`, fullPage: true });
  await page.screenshot({ path: `${SUCCESS_DIR}/ui_state.png`, fullPage: true });
  await page.screenshot({ path: `${EDGE_DIR}/valid_case.png`, fullPage: true });

  // Invalid case: missing required role field should show field-level validation
  await page.locator('[data-testid="spoc-job-card"]').filter({ hasText: updatedRole }).first().locator('button[title="Edit"]').click();
  await page.locator('form#jobForm input[type="text"]').nth(1).fill('');
  await page.getByRole('button', { name: /update & publish/i }).click();
  await page.screenshot({ path: `${FAIL_DIR}/invalid_case.png`, fullPage: true });
  await page.screenshot({ path: `${EDIT_DIR}/invalid_case.png`, fullPage: true });

  // Edge: republish with no changes should still pass
  await page.locator('form#jobForm input[type="text"]').nth(1).fill(updatedRole);
  await page.getByRole('button', { name: /update & publish/i }).click();
  await expect(page.getByText(updatedRole)).toBeVisible({ timeout: 20000 });
  await page.screenshot({ path: `${EDGE_DIR}/edge_case.png`, fullPage: true });
  await page.screenshot({ path: `${EDGE_DIR}/ui_state.png`, fullPage: true });
  await page.screenshot({ path: `${SUCCESS_DIR}/edge_case.png`, fullPage: true });
  await page.screenshot({ path: `${FAIL_DIR}/edge_case.png`, fullPage: true });
  await page.screenshot({ path: `${FAIL_DIR}/valid_case.png`, fullPage: true });
  await page.screenshot({ path: `${FAIL_DIR}/ui_state.png`, fullPage: true });
  await page.screenshot({ path: `${EDIT_DIR}/edge_case.png`, fullPage: true });
});

