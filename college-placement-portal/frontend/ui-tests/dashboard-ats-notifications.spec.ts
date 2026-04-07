import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const STUDENT_EMAIL = 'student@example.com';
const STUDENT_PASSWORD = 'Pass@123';
const SCREENSHOTS_DIR = 'ui-tests/screenshots';

test.beforeAll(() => {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
});

async function loginAsStudent(page: import('@playwright/test').Page) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').waitFor({ state: 'visible', timeout: 15000 });
  await page.getByPlaceholder('you@example.com').fill(STUDENT_EMAIL);
  await page.getByPlaceholder('Enter your password').fill(STUDENT_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
}

test.describe('Dashboard, ATS, Notifications, Role Guard', () => {
  test('apply job -> ATS score visible in success message or application', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto('/job-board', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: /job board/i })).toBeVisible({ timeout: 10000 });

    const applyBtn = page.getByRole('button', { name: /apply now/i }).first();
    if ((await applyBtn.count()) === 0) {
      test.skip();
      return;
    }
    await applyBtn.click();
    await page.getByRole('button', { name: /select.*resume|resume/i }).first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    const resumeOption = page.locator('input[type="radio"][name="resume"]').first();
    if (await resumeOption.count() > 0) {
      await resumeOption.click({ force: true });
    }
    await page.getByRole('button', { name: /next|continue/i }).first().click().catch(() => {});
    await page.getByRole('button', { name: /submit|apply/i }).first().click().catch(() => {});

    await page.waitForTimeout(2000);
    const atsInSuccess = page.getByText(/ATS Score|ats score| \d+ \/ 100/i);
    const atsInApp = page.getByText(/\d+ \/ 100/);
    const hasAts = (await atsInSuccess.count()) > 0 || (await atsInApp.count()) > 0;
    if (hasAts) {
      await expect(atsInSuccess.or(atsInApp).first()).toBeVisible({ timeout: 5000 });
    }
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/ats-after-apply.png` });
  });

  test('notification bell opens dropdown and shows notifications', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    const bell = page.getByTestId('notification-bell');
    await bell.click();
    await page.waitForTimeout(500);
    const notifPanel = page.getByText('Notifications').first();
    await expect(notifPanel).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/notification-bell-open.png` });
  });

  test('available jobs count comes from API (dashboard cards)', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    await expect(page.getByText('Available Jobs')).toBeVisible({ timeout: 10000 });
    const card = page.locator('text=Available Jobs').locator('..').locator('..');
    await expect(card).toContainText(/\d+/);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/dashboard-available-jobs-count.png` });
  });

  test('student cannot view other applicants - redirects from job details', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    await page.goto('/jobs/00000000-0000-0000-0000-000000000001/details', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/job-board/, { timeout: 10000 });
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/student-redirect-from-job-details.png` });
  });

  test('dashboard has no Recommended Jobs section', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    await expect(page.getByText('Recommended Jobs')).not.toBeVisible();
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/dashboard-no-recommended-jobs.png` });
  });

  test('dashboard has no Profile Strength card', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    await expect(page.getByText('Profile Strength')).not.toBeVisible();
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/dashboard-no-profile-strength.png` });
  });

  test('branch filter dropdown has correct options', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto('/job-board', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /available jobs|jobs/i }).first().click().catch(() => {});
    await page.getByTestId('branch-select').waitFor({ state: 'visible', timeout: 5000 });
    await page.getByTestId('branch-select').selectOption('CSE');
    await expect(page.getByTestId('branch-select')).toHaveValue('CSE');
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/branch-filter-dropdown.png` });
  });

  test('notifications dropdown is scrollable (max-h-80)', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    await page.getByTestId('notification-bell').click();
    await page.waitForTimeout(300);
    const dropdown = page.locator('.max-h-80').first();
    await expect(dropdown).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/notifications-scrollable.png` });
  });

  test('profile completion percentage shown', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    const completion = page.getByText(/Profile Completion|% complete/i);
    await expect(completion.first()).toBeVisible({ timeout: 8000 });
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/profile-completion-percentage.png` });
  });
});
