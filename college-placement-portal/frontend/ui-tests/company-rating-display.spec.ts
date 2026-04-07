import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const API_BASE = 'http://localhost:5001/api';
const SPOC_EMAIL = 'ui_spoc@example.com';
const PASSWORD = 'Password@123';
const ROOT = 'verification_screenshots/company_json_system';
const DISPLAY_DIR = `${ROOT}/rating_display`;
const FALLBACK_DIR = `${ROOT}/fallback_case`;
const EDGE_DIR = `${ROOT}/edge_cases`;

test.beforeAll(() => {
  fs.mkdirSync(DISPLAY_DIR, { recursive: true });
  fs.mkdirSync(FALLBACK_DIR, { recursive: true });
  fs.mkdirSync(EDGE_DIR, { recursive: true });
});

test('rating display and fallback on job form company profile', async ({ page }) => {
  await page.request.get(`${API_BASE}/seed/seed-ui`);
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').fill(SPOC_EMAIL);
  await page.getByPlaceholder('Enter your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/jobs-management/, { timeout: 20000 });

  await page.getByRole('button', { name: /post new job/i }).click();
  const form = page.locator('form#jobForm');
  await page.locator('form#jobForm input[type="text"]').first().fill('Infosys Pvt Ltd');
  await expect(form.getByText(/Rating:\s*3\.5\/5/i).first()).toBeVisible();
  await expect(form.getByText(/Reviews:\s*48,300/i).first()).toBeVisible();
  await page.screenshot({ path: `${DISPLAY_DIR}/valid_case.png`, fullPage: true });
  await page.screenshot({ path: `${DISPLAY_DIR}/ui_state.png`, fullPage: true });

  await page.locator('form#jobForm input[type="text"]').first().fill('Unknown Startup');
  await expect(form.getByText(/Rating not available/i).first()).toBeVisible();
  await expect(form.getByText(/Reviews not available/i).first()).toBeVisible();
  await page.screenshot({ path: `${EDGE_DIR}/unknown_company.png`, fullPage: true });
  await page.screenshot({ path: `${FALLBACK_DIR}/valid_case.png`, fullPage: true });
  await page.screenshot({ path: `${FALLBACK_DIR}/invalid_case.png`, fullPage: true });
  await page.screenshot({ path: `${FALLBACK_DIR}/edge_case.png`, fullPage: true });
  await page.screenshot({ path: `${FALLBACK_DIR}/ui_state.png`, fullPage: true });
  await page.screenshot({ path: `${DISPLAY_DIR}/invalid_case.png`, fullPage: true });
  await page.screenshot({ path: `${DISPLAY_DIR}/edge_case.png`, fullPage: true });
});

