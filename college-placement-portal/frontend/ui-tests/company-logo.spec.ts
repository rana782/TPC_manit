import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const API_BASE = 'http://localhost:5001/api';
const SPOC_EMAIL = 'ui_spoc@example.com';
const PASSWORD = 'Password@123';

const ROOT = 'verification_screenshots/logos';
const AUTO_DIR = `${ROOT}/autocomplete`;
const EDIT_DIR = `${ROOT}/edit_flow`;
const FALLBACK_DIR = `${ROOT}/fallback`;
const BROKEN_DIR = `${ROOT}/broken_url`;

test.beforeAll(() => {
  fs.mkdirSync(AUTO_DIR, { recursive: true });
  fs.mkdirSync(EDIT_DIR, { recursive: true });
  fs.mkdirSync(FALLBACK_DIR, { recursive: true });
  fs.mkdirSync(BROKEN_DIR, { recursive: true });
});

async function loginAsSpoc(page: import('@playwright/test').Page) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').waitFor({ state: 'visible', timeout: 15000 });
  await page.getByPlaceholder('you@example.com').fill(SPOC_EMAIL);
  await page.getByPlaceholder('Enter your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/jobs-management/, { timeout: 20000 });
}

test('autocomplete shows company logos + fallback + broken-url handling', async ({ page }) => {
  await page.request.get(`${API_BASE}/seed/seed-ui`);
  await loginAsSpoc(page);

  await page.getByRole('button', { name: /post new job/i }).click();
  await page.waitForSelector('form#jobForm', { timeout: 10000 });

  const form = page.locator('form#jobForm');
  const companyInput = form.locator('input[type="text"]').first();

  // Valid: TCS logo
  await companyInput.fill('tcs');
  await expect(page.getByAltText('TCS logo').first()).toBeVisible({ timeout: 20000 });
  await page.locator('button').filter({ hasText: 'TCS' }).first().click();
  await expect(page.getByAltText('TCS logo').first()).toBeVisible();

  await page.screenshot({ path: `${AUTO_DIR}/valid_case.png`, fullPage: true });
  await page.screenshot({ path: `${AUTO_DIR}/ui_state.png`, fullPage: true });

  // Edge: Unknown Startup XYZ should fall back to default-logo.png
  await companyInput.fill('Unknown Startup XYZ');
  // If backend has the entry, preview will attempt broken URL first; either way, we must not crash.
  await page.waitForTimeout(1500);
  // Our JobsManagement preview uses alt="Default company logo" when companyLookup is null.
  // If companyLookup is found, the broken URL should trigger onError and still end up rendering default-logo.png.
  const unknownPreviewLogo = page.getByAltText(/Unknown Startup XYZ logo/i).first();
  const defaultLogo = page.getByAltText('Default company logo').first();

  const hasUnknownLogo = (await unknownPreviewLogo.count()) > 0;
  if (hasUnknownLogo) {
    await expect(unknownPreviewLogo).toBeVisible();
  } else {
    await expect(defaultLogo).toBeVisible();
  }

  // Try to assert the rendered src is default (best-effort due to possible network timing).
  const src = (await unknownPreviewLogo.count()) > 0 ? await unknownPreviewLogo.getAttribute('src') : null;
  if (src) {
    expect(src).toContain('default-logo.png');
  }

  await page.screenshot({ path: `${BROKEN_DIR}/edge_case.png`, fullPage: true });

  // Invalid: random company should show "Rating not available" + default logo
  await companyInput.fill('Completely Unknown Co');
  await page.waitForTimeout(1000);
  await expect(page.getByAltText('Default company logo').first()).toBeVisible();
  await page.screenshot({ path: `${FALLBACK_DIR}/invalid_case.png`, fullPage: true });
});

test('edit flow logo updates when company changes', async ({ page }) => {
  await page.request.get(`${API_BASE}/seed/seed-ui`);
  await loginAsSpoc(page);

  // Post one job with company TCS
  await page.getByRole('button', { name: /post new job/i }).click();
  await page.waitForSelector('form#jobForm', { timeout: 10000 });

  const form = page.locator('form#jobForm');
  const companyInput = form.locator('input[type="text"]').first();
  const roleInput = form.locator('input[type="text"]').nth(1);
  const deadlineInput = form.locator('input[type="date"]').first();
  const ctcInput = form.getByPlaceholder('e.g. 12 LPA').first();
  const cgpaInput = form.locator('input[type="number"]').first();
  const descArea = form.locator('textarea').first();

  const suffix = Date.now().toString().slice(-6);
  await companyInput.fill('TCS');
  await roleInput.fill(`EditLogo Role ${suffix}`);
  await ctcInput.fill('15 LPA');
  await cgpaInput.fill('6.5');
  await descArea.fill('Testing edit flow logo update');

  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 30);
  await deadlineInput.fill(futureDate.toISOString().split('T')[0]);

  await page.getByText('Published (Visible)').click();
  await page.getByRole('button', { name: /save job posting/i }).click();
  await expect(page.getByText(`EditLogo Role ${suffix}`)).toBeVisible({ timeout: 20000 });

  // Open edit modal and verify initial logo
  await page.locator('[title="Edit"]').first().click();
  await expect(page.getByText(/Edit Job Posting/i)).toBeVisible({ timeout: 15000 });
  await expect(page.getByAltText('TCS logo').first()).toBeVisible({ timeout: 15000 });

  // Change company to Infosys and verify logo
  await companyInput.fill('Infosys');
  await page.waitForTimeout(1000);
  await page.locator('button').filter({ hasText: 'Infosys' }).first().click();
  await expect(page.getByAltText('Infosys logo').first()).toBeVisible({ timeout: 15000 });

  await page.screenshot({ path: `${EDIT_DIR}/valid_case.png`, fullPage: true });
});

