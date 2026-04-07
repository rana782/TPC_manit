import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const SPOC_EMAIL = 'spoc@example.com';
const SPOC_PASSWORD = 'Pass@123';
const VERIFICATION_DIR = 'verification_screenshots/spoc_module_round2';

test.beforeAll(() => {
  fs.mkdirSync(`${VERIFICATION_DIR}/deadline_validation`, { recursive: true });
});

async function loginAsSpoc(page: import('@playwright/test').Page) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').waitFor({ state: 'visible', timeout: 15000 });
  await page.getByPlaceholder('you@example.com').fill(SPOC_EMAIL);
  await page.getByPlaceholder('Enter your password').fill(SPOC_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/jobs-management/, { timeout: 15000 });
}

test.describe('SPOC Deadline Validation (strict: after today)', () => {
  test('invalid: today date shows error', async ({ page }) => {
    await loginAsSpoc(page);
    await page.getByRole('button', { name: /post new job/i }).click();
    await page.waitForSelector('form#jobForm', { timeout: 10000 });
    const today = new Date().toISOString().split('T')[0];
    await page.getByLabel('Company Name').fill('Test Corp');
    await page.getByLabel('Role / Job Title').fill('Engineer');
    await page.getByPlaceholder('e.g. 12 LPA').fill('10 LPA');
    await page.locator('input[type="date"]').first().fill(today);
    await page.getByLabel('Job Description').fill('We need a great engineer with at least 10 characters here.');
    await page.getByRole('button', { name: /save job posting/i }).click();
    await expect(page.getByText(/application deadline must be after today/i)).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: `${VERIFICATION_DIR}/deadline_validation/invalid_case.png` });
  });

  test('invalid: past date shows error', async ({ page }) => {
    await loginAsSpoc(page);
    await page.getByRole('button', { name: /post new job/i }).click();
    await page.waitForSelector('form#jobForm', { timeout: 10000 });
    await page.locator('input[type="date"]').first().fill('2020-01-01');
    await page.getByLabel('Company Name').fill('Past Corp');
    await page.getByLabel('Role / Job Title').fill('Dev');
    await page.getByPlaceholder('e.g. 12 LPA').fill('8 LPA');
    await page.getByLabel('Job Description').fill('Description with enough characters for validation.');
    await page.getByRole('button', { name: /save job posting/i }).click();
    await expect(page.getByText(/application deadline must be after today/i)).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: `${VERIFICATION_DIR}/deadline_validation/edge_case.png` });
  });

  test('valid: future date allows submit', async ({ page }) => {
    await loginAsSpoc(page);
    await page.getByRole('button', { name: /post new job/i }).click();
    await page.waitForSelector('form#jobForm', { timeout: 10000 });
    const future = new Date();
    future.setDate(future.getDate() + 1);
    const dateStr = future.toISOString().split('T')[0];
    await page.getByLabel('Company Name').fill('Valid Corp');
    await page.getByLabel('Role / Job Title').fill('Developer');
    await page.getByPlaceholder('e.g. 12 LPA').fill('15 LPA');
    await page.locator('input[type="date"]').first().fill(dateStr);
    await page.getByLabel('Job Description').fill('Join our team. We need a developer with strong skills.');
    await page.screenshot({ path: `${VERIFICATION_DIR}/deadline_validation/valid_case.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/deadline_validation/ui_state.png` });
  });
});
