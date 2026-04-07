import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const API_BASE = 'http://localhost:5001/api';
const SPOC_EMAIL = 'ui_spoc@example.com';
const STUDENT_EMAIL = 'ui_student@example.com';
const PASSWORD = 'Password@123';

const SHOTS_BASE = 'verification_screenshots/apply_fix';
const SUCCESS_DIR = `${SHOTS_BASE}/success_case`;
const SPOC_DIR = `${SHOTS_BASE}/spoc_view`;
const EDGE_DIR = `${SHOTS_BASE}/edge_case`;

test.beforeAll(() => {
  fs.mkdirSync(SUCCESS_DIR, { recursive: true });
  fs.mkdirSync(SPOC_DIR, { recursive: true });
  fs.mkdirSync(EDGE_DIR, { recursive: true });
});

async function login(page: import('@playwright/test').Page, email: string) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('Enter your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

async function enableBackendProxy(page: import('@playwright/test').Page) {
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const proxiedUrl = `http://localhost:5001${url.pathname}${url.search}`;
    const response = await page.request.fetch(proxiedUrl, {
      method: req.method(),
      headers: req.headers(),
      data: req.postDataBuffer() ?? undefined
    });
    await route.fulfill({
      status: response.status(),
      headers: response.headers(),
      body: await response.body()
    });
  });
}

test('real UI apply flow works and student application is visible', async ({ page }) => {
  const seedRes = await page.request.get(`${API_BASE}/seed/seed-ui`);
  expect(seedRes.ok()).toBeTruthy();
  await enableBackendProxy(page);

  const suffix = Date.now().toString().slice(-6);
  const role = `UI Apply Verification ${suffix}`;
  const company = `ApplyFlowCorp ${suffix}`;

  // SPOC posts published job
  await login(page, SPOC_EMAIL);
  await expect(page).toHaveURL(/\/jobs-management/, { timeout: 20000 });
  await page.getByRole('button', { name: /post new job/i }).click();
  await page.waitForSelector('form#jobForm', { timeout: 10000 });
  const form = page.locator('form#jobForm');
  await form.locator('input[type="text"]').nth(0).fill(company);
  await form.locator('input[type="text"]').nth(1).fill(role);
  await page.getByPlaceholder('e.g. 12 LPA').fill('16 LPA');
  await form.locator('textarea').first().fill('Real UI apply verification job posting.');
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 20);
  await page.locator('input[type="date"]').first().fill(futureDate.toISOString().split('T')[0]);
  await form.locator('input[type="number"]').first().fill('6.0');
  await page.locator('label:has-text("Published (Visible)")').click();
  await page.getByRole('button', { name: /save job posting/i }).click();
  await expect(page.getByText(role)).toBeVisible({ timeout: 20000 });

  // Student applies via JobBoard
  await login(page, STUDENT_EMAIL);
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 });
  await page.goto('/job-board', { waitUntil: 'networkidle' });
  const card = page.locator('[data-testid="job-card"]').filter({ hasText: role }).first();
  await expect(card).toBeVisible({ timeout: 20000 });
  await card.getByRole('button', { name: /apply now/i }).click();
  await page.locator('label:has(input[name="resume"])').first().click();
  await page.getByTestId('apply-ats-match-button').click();
  await expect(page.getByTestId('apply-ats-inline')).toContainText('/100', { timeout: 180000 });
  await page.getByRole('button', { name: /^next$/i }).click();
  await page.getByRole('button', { name: /submit application/i }).click();

  await expect(page.getByText(/Successfully applied!/i)).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/Failed to process job application/i)).toHaveCount(0);
  await page.screenshot({ path: `${SUCCESS_DIR}/real_apply_success.png`, fullPage: true });

  // SPOC applicants visibility evidence
  await login(page, SPOC_EMAIL);
  await expect(page).toHaveURL(/\/jobs-management/, { timeout: 20000 });
  await expect(page.getByText(role)).toBeVisible({ timeout: 20000 });
  await page.screenshot({ path: `${SPOC_DIR}/real_apply_spoc_view.png`, fullPage: true });
  await page.screenshot({ path: `${EDGE_DIR}/real_apply_ui_state.png`, fullPage: true });
});

