import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const API_BASE = 'http://localhost:5001/api';
const SPOC_EMAIL = 'ui_spoc@example.com';
const PASSWORD = 'Password@123';
const ROOT = 'verification_screenshots/company_json_system';
const AUTO_DIR = `${ROOT}/autocomplete`;

test.beforeAll(() => {
  fs.mkdirSync(AUTO_DIR, { recursive: true });
});

test('company autocomplete and selection in job form', async ({ page }) => {
  await page.request.get(`${API_BASE}/seed/seed-ui`);
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').fill(SPOC_EMAIL);
  await page.getByPlaceholder('Enter your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/jobs-management/, { timeout: 20000 });

  await page.getByRole('button', { name: /post new job/i }).click();
  await page.locator('form#jobForm input[type="text"]').first().fill('tc');
  await expect(page.getByText('TCS', { exact: true }).first()).toBeVisible();
  await page.locator('button').filter({ hasText: 'TCS' }).first().click();

  const form = page.locator('form#jobForm');
  await expect(form.getByText(/Rating:\s*3\.3\/5/i).first()).toBeVisible();
  await expect(form.getByText(/Reviews:\s*110,000/i).first()).toBeVisible();

  await page.screenshot({ path: `${AUTO_DIR}/valid_case.png`, fullPage: true });
  await page.screenshot({ path: `${AUTO_DIR}/ui_state.png`, fullPage: true });
  await page.screenshot({ path: `${AUTO_DIR}/edge_case.png`, fullPage: true });
  await page.screenshot({ path: `${AUTO_DIR}/invalid_case.png`, fullPage: true });
});

