import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const COORD_EMAIL = 'coord@example.com';
const COORD_PASSWORD = 'Pass@123';
const VERIFICATION_DIR = 'verification_screenshots/coordinator_admin_module';

test.beforeAll(() => {
  fs.mkdirSync(`${VERIFICATION_DIR}/coordinator_dashboard_removed`, { recursive: true });
});

async function loginAsCoordinator(page: import('@playwright/test').Page) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').waitFor({ state: 'visible', timeout: 15000 });
  await page.getByPlaceholder('you@example.com').fill(COORD_EMAIL);
  await page.getByPlaceholder('Enter your password').fill(COORD_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/admin/, { timeout: 15000 });
}

test.describe('Coordinator dashboard removed', () => {
  test('coordinator login redirects to admin (no dashboard)', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.getByPlaceholder('you@example.com').fill(COORD_EMAIL);
    await page.getByPlaceholder('Enter your password').fill(COORD_PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/admin/, { timeout: 15000 });
    await expect(page.getByText('Coordinator Panel')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: `${VERIFICATION_DIR}/coordinator_dashboard_removed/valid_case.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/coordinator_dashboard_removed/ui_state.png` });
  });

  test('coordinator sidebar does not show Dashboard link', async ({ page }) => {
    await loginAsCoordinator(page);
    const sidebar = page.locator('aside').first();
    await expect(sidebar.getByRole('link', { name: /^dashboard$/i })).toHaveCount(0);
    await page.screenshot({ path: `${VERIFICATION_DIR}/coordinator_dashboard_removed/edge_case.png` });
  });

  test('navigating to /dashboard as coordinator redirects to /admin', async ({ page }) => {
    await loginAsCoordinator(page);
    await page.goto('/dashboard', { waitUntil: 'networkidle', timeout: 15000 });
    await expect(page).toHaveURL(/\/admin/, { timeout: 15000 });
    await page.screenshot({ path: `${VERIFICATION_DIR}/coordinator_dashboard_removed/invalid_case.png` });
  });
});
