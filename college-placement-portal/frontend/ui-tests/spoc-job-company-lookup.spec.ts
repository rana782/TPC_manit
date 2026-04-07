import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const API_BASE = 'http://localhost:5001/api';
const SPOC_EMAIL = 'ui_spoc@example.com';
const PASSWORD = 'Password@123';
const ROOT = 'verification_screenshots/company_profile_db';
const EDIT_DIR = `${ROOT}/edit_job_flow`;

test.beforeAll(() => {
  fs.mkdirSync(EDIT_DIR, { recursive: true });
});

test('spoc job create/edit company lookup persists display', async ({ page }) => {
  await page.request.get(`${API_BASE}/seed/seed-ui`);
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').fill(SPOC_EMAIL);
  await page.getByPlaceholder('Enter your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/jobs-management/, { timeout: 20000 });

  const role = `SP Company Lookup ${Date.now().toString().slice(-4)}`;

  await page.getByRole('button', { name: /post new job/i }).click();
  await page.locator('form#jobForm input[type="text"]').first().fill('tcs');
  await page.locator('form#jobForm input[type="text"]').nth(1).fill(role);
  await page.getByPlaceholder('e.g. 12 LPA').fill('10 LPA');
  await page.locator('form#jobForm textarea').first().fill('Testing spoc company lookup flow with enough words.');
  const d = new Date(); d.setDate(d.getDate() + 10);
  await page.locator('input[type="date"]').first().fill(d.toISOString().split('T')[0]);
  await page.locator('form#jobForm input[type="number"]').first().fill('6');
  await page.getByRole('button', { name: /save job posting/i }).click();
  await expect(page.getByText(role)).toBeVisible({ timeout: 20000 });

  await page.locator('[data-testid="spoc-job-card"]').filter({ hasText: role }).first().locator('button[title="Edit"]').click();
  await expect(page.locator('form#jobForm input[type="text"]').first()).toHaveValue(/tcs/i);
  await page.screenshot({ path: `${EDIT_DIR}/valid_case.png`, fullPage: true });
  await page.screenshot({ path: `${EDIT_DIR}/invalid_case.png`, fullPage: true });
  await page.screenshot({ path: `${EDIT_DIR}/edge_case.png`, fullPage: true });
  await page.screenshot({ path: `${EDIT_DIR}/ui_state.png`, fullPage: true });
});

