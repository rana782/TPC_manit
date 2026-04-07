import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const API_BASE = 'http://localhost:5001/api';
const SPOC_EMAIL = 'ui_spoc@example.com';
const STUDENT_EMAIL = 'ui_student@example.com';
const PASSWORD = 'Password@123';

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

async function login(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').waitFor({ state: 'visible', timeout: 15000 });
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('Enter your password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

async function enableBackendProxy(page: import('@playwright/test').Page) {
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const originalUrl = req.url();
    const parsed = new URL(originalUrl);
    const proxiedUrl = `http://localhost:5001${parsed.pathname}${parsed.search}`;
    const response = await page.request.fetch(proxiedUrl, {
      method: req.method(),
      headers: req.headers(),
      data: req.postDataBuffer() ?? undefined,
    });
    const body = await response.body();
    await route.fulfill({
      status: response.status(),
      headers: response.headers(),
      body,
    });
  });
}

test('SPOC posts published job -> student sees it on job board', async ({ page }) => {
  const seedRes = await page.request.get(`${API_BASE}/seed/seed-ui`);
  expect(seedRes.ok()).toBeTruthy();
  await enableBackendProxy(page);

  const suffix = Date.now().toString().slice(-6);
  const role = `UI Real Flow Engineer ${suffix}`;
  const company = `UIFlowCorp ${suffix}`;

  // 1) SPOC: post a published job from UI
  await login(page, SPOC_EMAIL, PASSWORD);
  await expect(page).toHaveURL(/\/jobs-management/, { timeout: 20000 });
  await page.getByRole('button', { name: /post new job/i }).click();
  await page.waitForSelector('form#jobForm', { timeout: 10000 });

  const form = page.locator('form#jobForm');
  await form.locator('input[type="text"]').nth(0).fill(company);
  await form.locator('input[type="text"]').nth(1).fill(role);
  await page.getByPlaceholder('e.g. 12 LPA').fill('14 LPA');
  await form.locator('textarea').first().fill('Real UI e2e verification role for student job board visibility checks.');

  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 30);
  const dateStr = futureDate.toISOString().split('T')[0];
  await page.locator('input[type="date"]').first().fill(dateStr);

  await form.locator('input[type="number"]').first().fill('6.5');
  await page.locator('label:has-text("Published (Visible)")').click();

  await page.getByRole('button', { name: /save job posting/i }).click();
  // Save success can be toast-like and timing-sensitive; verify by list visibility.
  await expect(page.getByText(role)).toBeVisible({ timeout: 20000 });
  await page.screenshot({ path: `${API_SUCCESS_DIR}/spoc_posted_published_job.png`, fullPage: true });

  // 2) Student: verify visibility on Job Board + no error
  await login(page, STUDENT_EMAIL, PASSWORD);
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 });
  await page.goto('/job-board', { waitUntil: 'networkidle' });

  await expect(page.getByText(role)).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(company)).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Failed to fetch applications')).toHaveCount(0);
  await expect(page.getByText('Failed to load data')).toHaveCount(0);

  await page.screenshot({ path: `${JOBS_VISIBLE_DIR}/student_sees_posted_job.png`, fullPage: true });
  await page.screenshot({ path: `${NO_ERROR_DIR}/student_jobboard_no_api_error.png`, fullPage: true });
  await page.screenshot({ path: `${EDGE_CASES_DIR}/real_flow_ui_state.png`, fullPage: true });
});

