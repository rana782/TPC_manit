import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const API_BASE = 'http://localhost:5001/api';
const SPOC_EMAIL = 'ui_spoc@example.com';
const PASSWORD = 'Password@123';
const ROOT = 'verification_screenshots/company_json_system/selection';

test.beforeAll(() => {
  fs.mkdirSync(ROOT, { recursive: true });
});

test('job form: type partial name, select Shell, see rating and reviews', async ({ page }) => {
  await page.request.get(`${API_BASE}/seed/seed-ui`);
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').fill(SPOC_EMAIL);
  await page.getByPlaceholder('Enter your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/jobs-management/, { timeout: 20000 });

  await page.getByRole('button', { name: /post new job/i }).click();
  const form = page.locator('form#jobForm');
  await page.locator('form#jobForm input[type="text"]').first().fill('she');
  await expect(page.getByText('Shell', { exact: true }).first()).toBeVisible();
  await page.locator('button').filter({ hasText: 'Shell' }).first().click();

  await expect(form.getByText(/Rating:\s*3\.9\/5/i).first()).toBeVisible();
  await expect(form.getByText(/Reviews:\s*2,700/i).first()).toBeVisible();
  await page.screenshot({ path: `${ROOT}/valid_case.png`, fullPage: true });
});
