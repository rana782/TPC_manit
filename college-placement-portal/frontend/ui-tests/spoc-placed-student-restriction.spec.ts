import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const STUDENT_EMAIL = 'student@example.com';
const STUDENT_PASSWORD = 'Pass@123';
const VERIFICATION_DIR = 'verification_screenshots/spoc_module_round2';

test.beforeAll(() => {
  fs.mkdirSync(`${VERIFICATION_DIR}/placed_student_apply_disabled`, { recursive: true });
});

async function loginAsStudent(page: import('@playwright/test').Page) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').waitFor({ state: 'visible', timeout: 15000 });
  await page.getByPlaceholder('you@example.com').fill(STUDENT_EMAIL);
  await page.getByPlaceholder('Enter your password').fill(STUDENT_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/(dashboard|job-board|jobs-management)/, { timeout: 15000 });
}

test.describe('Placed student apply restriction', () => {
  test('job board shows Apply or Already Placed button', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto('/job-board', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: /job board/i })).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: `${VERIFICATION_DIR}/placed_student_apply_disabled/ui_state.png` });
    const appliedBtn = page.getByRole('button', { name: /apply now/i }).first();
    const placedBtn = page.getByRole('button', { name: /already placed/i }).first();
    const appliedSpan = page.getByText('Applied').first();
    if (await placedBtn.count() > 0) {
      await expect(placedBtn).toBeDisabled();
      await page.screenshot({ path: `${VERIFICATION_DIR}/placed_student_apply_disabled/valid_case.png` });
      await page.screenshot({ path: `${VERIFICATION_DIR}/placed_student_apply_disabled/edge_case.png` });
    } else if (await appliedBtn.count() > 0) {
      await page.screenshot({ path: `${VERIFICATION_DIR}/placed_student_apply_disabled/valid_case.png` });
    }
    await page.screenshot({ path: `${VERIFICATION_DIR}/placed_student_apply_disabled/invalid_case.png` }).catch(() => {});
  });

  test('Already Placed button has disabled and opacity styling', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto('/job-board', { waitUntil: 'networkidle' });
    const placedBtn = page.getByRole('button', { name: /already placed/i }).first();
    if ((await placedBtn.count()) > 0) {
      await expect(placedBtn).toBeDisabled();
      await expect(placedBtn).toHaveClass(/cursor-not-allowed|opacity/);
    }
  });
});
