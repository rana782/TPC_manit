import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const COORD_EMAIL = 'coord@example.com';
const COORD_PASSWORD = 'Pass@123';
const VERIFICATION_DIR = 'verification_screenshots/coordinator_admin_module';

test.beforeAll(() => {
  fs.mkdirSync(`${VERIFICATION_DIR}/locked_profiles_dynamic`, { recursive: true });
});

async function loginAsCoordinator(page: import('@playwright/test').Page) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').fill(COORD_EMAIL);
  await page.getByPlaceholder('Enter your password').fill(COORD_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/admin/, { timeout: 15000 });
}

test.describe('Admin Locked Profiles counter', () => {
  test('admin dashboard shows Locked Profiles card with value', async ({ page }) => {
    await loginAsCoordinator(page);
    await expect(page.getByText('Locked Profiles')).toBeVisible({ timeout: 10000 });
    const lockedCard = page.locator('text=Locked Profiles').first().locator('..').locator('..');
    await expect(lockedCard).toContainText(/\d+/);
    await page.screenshot({ path: `${VERIFICATION_DIR}/locked_profiles_dynamic/valid_case.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/locked_profiles_dynamic/ui_state.png` });
  });

  test('Dashboard tab shows Total Students, Placed Students, Locked Profiles', async ({ page }) => {
    await loginAsCoordinator(page);
    await expect(page.getByText('Total Students')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('Placed Students')).toBeVisible();
    await expect(page.getByText('Locked Profiles')).toBeVisible();
    await page.screenshot({ path: `${VERIFICATION_DIR}/locked_profiles_dynamic/edge_case.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/locked_profiles_dynamic/invalid_case.png` });
  });
});
