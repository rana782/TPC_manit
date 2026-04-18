/**
 * Student /profile must render (not stuck on skeleton). Backend auto-creates Student on first GET when missing.
 * Default: seeded ui_student. Override: E2E_STUDENT_EMAIL / E2E_STUDENT_PASSWORD
 */
import { test, expect } from '@playwright/test';

const API_BASE = process.env.E2E_API_URL || 'http://localhost:5001';
const STUDENT_EMAIL = process.env.E2E_STUDENT_EMAIL || 'ui_student@example.com';
const STUDENT_PASSWORD = process.env.E2E_STUDENT_PASSWORD || 'Password@123';

test.describe('Student profile page', () => {
  test('loads profile builder after login (no infinite skeleton)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Use --project=desktop');

    await page.request.get(`${API_BASE}/api/seed/seed-ui`).catch(() => {});

    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.getByPlaceholder('you@example.com').fill(STUDENT_EMAIL);
    await page.getByPlaceholder('Enter your password').fill(STUDENT_PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 25000 });

    await page.goto('/profile', { waitUntil: 'networkidle' });
    await expect(page.getByTestId('student-profile-loaded')).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('heading', { name: /Profile Builder/i })).toBeVisible();
    await expect(page.getByTestId('student-profile-load-error')).toHaveCount(0);
  });
});
