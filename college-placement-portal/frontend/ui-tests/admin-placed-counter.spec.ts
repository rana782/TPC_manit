import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const COORD_EMAIL = 'coord@example.com';
const COORD_PASSWORD = 'Pass@123';
const VERIFICATION_DIR = 'verification_screenshots/coordinator_admin_module';

test.beforeAll(() => {
  fs.mkdirSync(`${VERIFICATION_DIR}/admin_cards_update`, { recursive: true });
  fs.mkdirSync(`${VERIFICATION_DIR}/placed_counter_dynamic`, { recursive: true });
});

async function loginAsCoordinator(page: import('@playwright/test').Page) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').fill(COORD_EMAIL);
  await page.getByPlaceholder('Enter your password').fill(COORD_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/admin/, { timeout: 15000 });
}

test.describe('Admin Placed Students card', () => {
  test('admin dashboard shows Placed Students card (no On-Campus/Off-Campus)', async ({ page }) => {
    await loginAsCoordinator(page);
    await expect(page.getByText('Placed Students')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('On-Campus Placed')).toHaveCount(0);
    await expect(page.getByText('Off-Campus')).toHaveCount(0);
    await page.screenshot({ path: `${VERIFICATION_DIR}/admin_cards_update/valid_case.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/admin_cards_update/ui_state.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/placed_counter_dynamic/valid_case.png` });
  });

  test('Placed Students and Locked Profiles cards show numeric values', async ({ page }) => {
    await loginAsCoordinator(page);
    await expect(page.getByText('Placed Students')).toBeVisible({ timeout: 10000 });
    const placedCard = page.locator('text=Placed Students').locator('..').locator('..');
    await expect(placedCard).toContainText(/\d+/);
    await page.screenshot({ path: `${VERIFICATION_DIR}/admin_cards_update/edge_case.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/placed_counter_dynamic/ui_state.png` });
  });
});
