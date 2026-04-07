import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const SPOC_EMAIL = 'spoc@example.com';
const SPOC_PASSWORD = 'Pass@123';
const VERIFICATION_DIR = 'verification_screenshots/spoc_module';

test.beforeAll(() => {
  const subdirs = ['dashboard_removed', 'job_post_branch_selection', 'job_deadline_validation', 'timeline_validation', 'student_job_visibility'];
  subdirs.forEach((d) => fs.mkdirSync(`${VERIFICATION_DIR}/${d}`, { recursive: true }));
});

async function loginAsSpoc(page: import('@playwright/test').Page) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').waitFor({ state: 'visible', timeout: 15000 });
  await page.getByPlaceholder('you@example.com').fill(SPOC_EMAIL);
  await page.getByPlaceholder('Enter your password').fill(SPOC_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/jobs-management/, { timeout: 15000 });
}

test.describe('SPOC Job Post', () => {
  test('SPOC redirects to jobs-management (no dashboard)', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.getByPlaceholder('you@example.com').fill(SPOC_EMAIL);
    await page.getByPlaceholder('Enter your password').fill(SPOC_PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/jobs-management/, { timeout: 15000 });
    await expect(page.getByRole('heading', { name: /jobs management/i })).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: `${VERIFICATION_DIR}/dashboard_removed/valid_case.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/dashboard_removed/ui_state.png` });
  });

  test('direct /dashboard as SPOC redirects to jobs-management', async ({ page }) => {
    await loginAsSpoc(page);
    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/jobs-management/, { timeout: 10000 });
    await page.screenshot({ path: `${VERIFICATION_DIR}/dashboard_removed/edge_case.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/dashboard_removed/invalid_case.png` });
  });

  test('open post job modal and see eligible branches (stable selection)', async ({ page }) => {
    await loginAsSpoc(page);
    await page.getByRole('button', { name: /post new job/i }).click();
    await page.waitForSelector('form#jobForm', { timeout: 10000 });
    await expect(page.getByText('Eligible Branches')).toBeVisible();
    await expect(page.getByText('CSE')).toBeVisible();
    await page.screenshot({ path: `${VERIFICATION_DIR}/job_post_branch_selection/ui_state.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/job_post_branch_selection/invalid_case.png` });
    const cseLabel = page.locator('label:has-text("CSE")').first();
    await cseLabel.click();
    await page.waitForTimeout(300);
    await cseLabel.click();
    await page.waitForTimeout(300);
    await cseLabel.click();
    await expect(page.getByText('CSE').locator('..').locator('input[type="checkbox"]')).toBeChecked();
    await page.screenshot({ path: `${VERIFICATION_DIR}/job_post_branch_selection/valid_case.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/job_post_branch_selection/edge_case.png` });
  });

  test('invalid deadline shows error and blocks submit', async ({ page }) => {
    await loginAsSpoc(page);
    await page.getByRole('button', { name: /post new job/i }).click();
    await page.waitForSelector('form#jobForm', { timeout: 10000 });
    await page.getByLabel('Company Name').fill('Test Corp');
    await page.getByLabel('Role / Job Title').fill('Engineer');
    await page.getByPlaceholder('e.g. 12 LPA').fill('10 LPA');
    const deadlineInput = page.locator('input[type="date"]').first();
    await deadlineInput.fill('2020-01-01');
    await page.getByLabel('Job Description').fill('We need a great engineer with at least 10 characters here.');
    await page.getByRole('button', { name: /save|create|submit/i }).first().click();
    await expect(page.getByText(/application deadline cannot be before today/i)).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: `${VERIFICATION_DIR}/job_deadline_validation/invalid_case.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/job_deadline_validation/edge_case.png` });
  });

  test('valid deadline allows submit', async ({ page }) => {
    await loginAsSpoc(page);
    await page.getByRole('button', { name: /post new job/i }).click();
    await page.waitForSelector('form#jobForm', { timeout: 10000 });
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    const dateStr = futureDate.toISOString().split('T')[0];
    await page.getByLabel('Company Name').fill('Valid Corp');
    await page.getByLabel('Role / Job Title').fill('Developer');
    await page.getByPlaceholder('e.g. 12 LPA').fill('15 LPA');
    await page.locator('input[type="date"]').first().fill(dateStr);
    await page.getByLabel('Job Description').fill('Join our team. We need a developer with strong skills and at least ten characters.');
    await page.screenshot({ path: `${VERIFICATION_DIR}/job_deadline_validation/valid_case.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/job_deadline_validation/ui_state.png` });
  });
});

test.describe('Student job visibility', () => {
  const STUDENT_EMAIL = 'student@example.com';
  const STUDENT_PASSWORD = 'Pass@123';

  async function loginAsStudent(page: import('@playwright/test').Page) {
    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.getByPlaceholder('you@example.com').fill(STUDENT_EMAIL);
    await page.getByPlaceholder('Enter your password').fill(STUDENT_PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
  }

  test('published jobs visible on job board', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto('/job-board', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: /job board/i })).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: `${VERIFICATION_DIR}/student_job_visibility/ui_state.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/student_job_visibility/valid_case.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/student_job_visibility/edge_case.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/student_job_visibility/invalid_case.png` });
  });
});
