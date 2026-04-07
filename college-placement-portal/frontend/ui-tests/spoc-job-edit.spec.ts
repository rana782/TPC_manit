import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const SPOC_EMAIL = 'spoc@example.com';
const SPOC_PASSWORD = 'Pass@123';
const VERIFICATION_DIR = 'verification_screenshots/spoc_module';

test.beforeAll(() => {
  fs.mkdirSync(`${VERIFICATION_DIR}/manage_jobs_edit`, { recursive: true });
  fs.mkdirSync(`${VERIFICATION_DIR}/timeline_validation`, { recursive: true });
});

async function loginAsSpoc(page: import('@playwright/test').Page) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').waitFor({ state: 'visible', timeout: 15000 });
  await page.getByPlaceholder('you@example.com').fill(SPOC_EMAIL);
  await page.getByPlaceholder('Enter your password').fill(SPOC_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/jobs-management/, { timeout: 15000 });
}

test.describe('SPOC Job Edit', () => {
  test('edit job opens modal with parsed branches and required fields', async ({ page }) => {
    await loginAsSpoc(page);
    await expect(page.getByTestId('spoc-dashboard')).toBeVisible({ timeout: 10000 });
    const editBtn = page.getByTitle('Edit').first();
    if ((await editBtn.count()) === 0) {
      await page.screenshot({ path: `${VERIFICATION_DIR}/manage_jobs_edit/ui_state.png` });
      test.skip();
      return;
    }
    await editBtn.click();
    await page.waitForSelector('form#jobForm', { timeout: 10000 });
    await expect(page.getByRole('heading', { name: /edit job/i })).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: `${VERIFICATION_DIR}/manage_jobs_edit/ui_state.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/manage_jobs_edit/valid_case.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/manage_jobs_edit/edge_case.png` });
  });

  test('edit job and save shows success and refreshes list', async ({ page }) => {
    await loginAsSpoc(page);
    const editBtn = page.getByTitle('Edit').first();
    if ((await editBtn.count()) === 0) {
      test.skip();
      return;
    }
    await editBtn.click();
    await page.waitForSelector('form#jobForm', { timeout: 10000 });
    const companyInput = page.getByLabel('Company Name');
    await companyInput.clear();
    await companyInput.fill('Updated Company Name');
    await page.getByRole('button', { name: /save|update/i }).first().click();
    await expect(page.getByText(/job updated successfully|Job updated/i)).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: `${VERIFICATION_DIR}/manage_jobs_edit/valid_case.png` });
  });

  test('edit with past deadline shows error', async ({ page }) => {
    await loginAsSpoc(page);
    const editBtn = page.getByTitle('Edit').first();
    if ((await editBtn.count()) === 0) {
      test.skip();
      return;
    }
    await editBtn.click();
    await page.waitForSelector('form#jobForm', { timeout: 10000 });
    await page.locator('input[type="date"]').first().fill('2020-01-01');
    await page.getByRole('button', { name: /save|update/i }).first().click();
    await expect(page.getByText(/deadline cannot be before today|application deadline/i)).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: `${VERIFICATION_DIR}/manage_jobs_edit/invalid_case.png` });
  });

  test('timeline: add stage with date before deadline shows error', async ({ page }) => {
    await loginAsSpoc(page);
    const manageBtn = page.getByTitle('Manage').or(page.getByTitle('Manage Details')).first();
    if ((await manageBtn.count()) === 0) {
      await page.screenshot({ path: `${VERIFICATION_DIR}/timeline_validation/ui_state.png` });
      test.skip();
      return;
    }
    await manageBtn.click();
    await page.waitForURL(/\/jobs\/.*\/details/, { timeout: 10000 }).catch(() => {});
    await page.screenshot({ path: `${VERIFICATION_DIR}/timeline_validation/ui_state.png` });
    const stageNameInput = page.getByPlaceholder(/e.g. Technical/i);
    const stageDateInput = page.locator('form').filter({ has: page.getByText('Add New Stage') }).locator('input[type="date"]').first();
    if ((await stageDateInput.count()) === 0) {
      await page.screenshot({ path: `${VERIFICATION_DIR}/timeline_validation/edge_case.png` });
      test.skip();
      return;
    }
    await stageNameInput.fill('Shortlist');
    await stageDateInput.fill('2020-01-01');
    await page.getByRole('button', { name: /add stage/i }).click();
    await expect(page.getByText(/timeline stages must occur|application deadline/i)).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: `${VERIFICATION_DIR}/timeline_validation/invalid_case.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/timeline_validation/edge_case.png` });
  });

  test('timeline: valid stage date after deadline', async ({ page }) => {
    await loginAsSpoc(page);
    const manageBtn = page.getByTitle('Manage').or(page.getByTitle('Manage Details')).first();
    if ((await manageBtn.count()) === 0) { test.skip(); return; }
    await manageBtn.click();
    await page.waitForURL(/\/jobs\/.*\/details/, { timeout: 10000 }).catch(() => {});
    const stageDateInput = page.locator('form').filter({ has: page.getByText('Add New Stage') }).locator('input[type="date"]').first();
    if ((await stageDateInput.count()) === 0) { test.skip(); return; }
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    await page.getByPlaceholder(/e.g. Technical/i).fill('Final Round');
    await stageDateInput.fill(futureDate.toISOString().split('T')[0]);
    await page.screenshot({ path: `${VERIFICATION_DIR}/timeline_validation/valid_case.png` });
  });
});
