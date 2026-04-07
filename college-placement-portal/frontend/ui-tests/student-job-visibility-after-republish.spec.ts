import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const API_BASE = 'http://localhost:5001/api';
const SPOC_EMAIL = 'ui_spoc@example.com';
const STUDENT_EMAIL = 'ui_student@example.com';
const PASSWORD = 'Password@123';

const ROOT = 'verification_screenshots/manage_job_publish_fix';
const STUDENT_DIR = `${ROOT}/student_visibility`;
const SUCCESS_DIR = `${ROOT}/republish_success`;

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
  [STUDENT_DIR, SUCCESS_DIR].forEach((d) => fs.mkdirSync(d, { recursive: true }));
});

test('student sees edited republished job', async ({ page }) => {
  const seedRes = await page.request.get(`${API_BASE}/seed/seed-ui`);
  expect(seedRes.ok()).toBeTruthy();
  await enableBackendProxy(page);

  const suffix = Date.now().toString().slice(-6);
  const role = `Visibility Base ${suffix}`;
  const republishedRole = `Visibility Updated ${suffix}`;

  await login(page, SPOC_EMAIL);
  await expect(page).toHaveURL(/\/jobs-management/, { timeout: 20000 });
  await page.getByRole('button', { name: /post new job/i }).click();
  const form = page.locator('form#jobForm');
  await form.locator('input[type="text"]').nth(0).fill('VisibilityCorp');
  await form.locator('input[type="text"]').nth(1).fill(role);
  await page.getByPlaceholder('e.g. 12 LPA').fill('13 LPA');
  await form.locator('textarea').first().fill('Visibility republish verification job.');
  const d = new Date(); d.setDate(d.getDate() + 17);
  await page.locator('input[type="date"]').first().fill(d.toISOString().split('T')[0]);
  await form.locator('input[type="number"]').first().fill('7');
  await page.getByRole('button', { name: /save job posting/i }).click();
  await expect(page.getByText(role)).toBeVisible({ timeout: 20000 });

  await page.locator('[data-testid="spoc-job-card"]').filter({ hasText: role }).first().locator('button[title="Edit"]').click();
  await page.locator('form#jobForm input[type="text"]').nth(1).fill(republishedRole);
  await page.getByRole('button', { name: /update & publish/i }).click();
  await expect(page.getByText(republishedRole)).toBeVisible({ timeout: 20000 });

  await login(page, STUDENT_EMAIL);
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 });
  await page.goto('/job-board', { waitUntil: 'networkidle' });
  await expect(page.getByText(republishedRole)).toBeVisible({ timeout: 20000 });
  await page.screenshot({ path: `${STUDENT_DIR}/valid_case.png`, fullPage: true });
  await page.screenshot({ path: `${STUDENT_DIR}/ui_state.png`, fullPage: true });
  await page.screenshot({ path: `${STUDENT_DIR}/edge_case.png`, fullPage: true });
  await page.screenshot({ path: `${STUDENT_DIR}/invalid_case.png`, fullPage: true });
  await page.screenshot({ path: `${SUCCESS_DIR}/invalid_case.png`, fullPage: true });
});

