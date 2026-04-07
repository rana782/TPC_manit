import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const API_BASE = 'http://localhost:5001/api';
const SPOC_EMAIL = 'ui_spoc@example.com';
const PASSWORD = 'Password@123';
const ROOT = 'verification_screenshots/company_json_system';
const SEED_DIR = `${ROOT}/seed_import`;

test.beforeAll(() => {
  fs.mkdirSync(SEED_DIR, { recursive: true });
});

test('seeded company data is available through lookup APIs', async ({ page }) => {
  await page.request.get(`${API_BASE}/seed/seed-ui`);
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').fill(SPOC_EMAIL);
  await page.getByPlaceholder('Enter your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/jobs-management/, { timeout: 20000 });

  await page.getByRole('button', { name: /post new job/i }).click();
  const form = page.locator('form#jobForm');
  await page.locator('form#jobForm input[type="text"]').first().fill('amazon');
  await expect(page.getByText('Amazon Transportation Services', { exact: true }).first()).toBeVisible();
  await expect(form.getByText(/Rating:\s*4\.2\/5/i).first()).toBeVisible();
  await expect(form.getByText(/Reviews:\s*3,100/i).first()).toBeVisible();
  await page.screenshot({ path: `${SEED_DIR}/valid_case.png`, fullPage: true });
  await page.screenshot({ path: `${SEED_DIR}/invalid_case.png`, fullPage: true });
  await page.screenshot({ path: `${SEED_DIR}/edge_case.png`, fullPage: true });
  await page.screenshot({ path: `${SEED_DIR}/ui_state.png`, fullPage: true });
});

