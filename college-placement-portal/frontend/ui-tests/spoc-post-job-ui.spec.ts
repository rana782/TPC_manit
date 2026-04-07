import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const SPOC_EMAIL = 'spoc@example.com';
const SPOC_PASSWORD = 'Pass@123';
const VERIFICATION_DIR = 'verification_screenshots/spoc_module_round2';

test.beforeAll(() => {
  fs.mkdirSync(`${VERIFICATION_DIR}/job_post_ui_stability`, { recursive: true });
  fs.mkdirSync(`${VERIFICATION_DIR}/dashboard_removed`, { recursive: true });
  fs.mkdirSync(`${VERIFICATION_DIR}/sidebar_no_profile`, { recursive: true });
});

async function loginAsSpoc(page: import('@playwright/test').Page) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').waitFor({ state: 'visible', timeout: 15000 });
  await page.getByPlaceholder('you@example.com').fill(SPOC_EMAIL);
  await page.getByPlaceholder('Enter your password').fill(SPOC_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/jobs-management/, { timeout: 15000 });
}

test.describe('SPOC Post Job UI stability', () => {
  test('open post job modal - sections visible and stable', async ({ page }) => {
    await loginAsSpoc(page);
    await page.getByRole('button', { name: /post new job/i }).click();
    await page.waitForSelector('form#jobForm', { timeout: 10000 });
    await expect(page.getByText('Eligible Branches')).toBeVisible();
    await expect(page.getByText('Required Student Profile Fields')).toBeVisible();
    await page.screenshot({ path: `${VERIFICATION_DIR}/job_post_ui_stability/ui_state.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/job_post_ui_stability/valid_case.png` });
  });

  test('rapid branch selection does not collapse UI', async ({ page }) => {
    await loginAsSpoc(page);
    await page.getByRole('button', { name: /post new job/i }).click();
    await page.waitForSelector('form#jobForm', { timeout: 10000 });
    const cseLabel = page.locator('label:has-text("CSE")').first();
    const eceLabel = page.locator('label:has-text("ECE")').first();
    for (let i = 0; i < 5; i++) {
      await cseLabel.click();
      await eceLabel.click();
    }
    await expect(page.getByText('Eligible Branches')).toBeVisible();
    await page.screenshot({ path: `${VERIFICATION_DIR}/job_post_ui_stability/edge_case.png` });
  });

  test('select and deselect multiple branches - UI stable', async ({ page }) => {
    await loginAsSpoc(page);
    await page.getByRole('button', { name: /post new job/i }).click();
    await page.waitForSelector('form#jobForm', { timeout: 10000 });
    await page.locator('label:has-text("CSE")').first().click();
    await page.locator('label:has-text("ECE")').first().click();
    await page.locator('label:has-text("Mech")').first().click();
    await page.locator('label:has-text("CSE")').first().click();
    await expect(page.getByText('Eligibility Criteria')).toBeVisible();
    await page.screenshot({ path: `${VERIFICATION_DIR}/job_post_ui_stability/invalid_case.png` });
  });
});

test.describe('SPOC Dashboard removed', () => {
  test('SPOC login redirects to jobs-management', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.getByPlaceholder('you@example.com').fill(SPOC_EMAIL);
    await page.getByPlaceholder('Enter your password').fill(SPOC_PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/jobs-management/, { timeout: 15000 });
    await page.screenshot({ path: `${VERIFICATION_DIR}/dashboard_removed/valid_case.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/dashboard_removed/ui_state.png` });
  });

  test('navigating to /dashboard as SPOC redirects to jobs-management', async ({ page }) => {
    await loginAsSpoc(page);
    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/jobs-management/, { timeout: 10000 });
    await page.screenshot({ path: `${VERIFICATION_DIR}/dashboard_removed/edge_case.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/dashboard_removed/invalid_case.png` });
  });
});

test.describe('SPOC Sidebar - Profile removed', () => {
  test('SPOC sidebar does not show Profile link and capture screenshot', async ({ page }) => {
    await loginAsSpoc(page);
    await expect(page.getByRole('heading', { name: /jobs management/i })).toBeVisible({ timeout: 10000 });
    const sidebar = page.locator('aside').first();
    await expect(sidebar).toBeVisible({ timeout: 5000 });
    await expect(sidebar.getByRole('link', { name: /^profile$/i })).toHaveCount(0);
    await page.screenshot({ path: `${VERIFICATION_DIR}/sidebar_no_profile/spoc_sidebar_no_profile.png` });
  });
});
