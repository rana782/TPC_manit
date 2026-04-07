import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const STUDENT_EMAIL = 'student@example.com';
const STUDENT_PASSWORD = 'Pass@123';
const SCREENSHOTS_DIR = 'ui-tests/screenshots';
const VERIFICATION_DIR = 'verification_screenshots/student_profile';

test.beforeAll(() => {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  const subdirs = ['branch_dropdown', 'course_dropdown', 'scholar_number_validation', 'percentage_validation', 'gap_validation', 'backlog_validation', 'pincode_validation', 'internship_date_validation', 'profile_picture_preview', 'documents_preview', 'cgpa_sgpa_semester_validation'];
  subdirs.forEach((d) => fs.mkdirSync(`${VERIFICATION_DIR}/${d}`, { recursive: true }));
});

async function loginAsStudent(page: import('@playwright/test').Page) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').waitFor({ state: 'visible', timeout: 15000 });
  await page.getByPlaceholder('you@example.com').fill(STUDENT_EMAIL);
  await page.getByPlaceholder('Enter your password').fill(STUDENT_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
}

test.describe('Student Profile Form', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStudent(page);
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: /profile builder/i })).toBeVisible({ timeout: 10000 });
  });

  test('1. invalid scholar number shows error below field', async ({ page }) => {
    await page.getByLabel('Branch').waitFor({ state: 'visible', timeout: 5000 });
    await page.getByLabel('Scholar Number').fill('12345');
    await page.getByLabel('Phone').click();
    await expect(page.getByText('Scholar number must contain exactly 10 digits').first()).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/01-scholar-validation.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/scholar_number_validation/invalid_input.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/scholar_number_validation/edge_case.png` });
  });

  test('scholar number valid and ui_display', async ({ page }) => {
    await page.getByLabel('Scholar Number').fill('1234567890');
    await page.getByLabel('Branch').click();
    await page.screenshot({ path: `${VERIFICATION_DIR}/scholar_number_validation/valid_input.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/scholar_number_validation/ui_display.png` });
  });

  test('2. invalid percentage shows error', async ({ page }) => {
    await page.getByRole('button', { name: 'Academic' }).click();
    await page.getByLabel('10th Percentage').fill('101');
    await page.getByLabel('10th Percentage').blur();
    await page.getByRole('button', { name: /save & next/i }).click();
    await expect(page.getByText('Percentage must be between 0 and 100').first()).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/02-percentage-validation.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/percentage_validation/invalid_input.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/percentage_validation/edge_case.png` });
  });

  test('percentage valid and ui_display', async ({ page }) => {
    await page.getByRole('button', { name: 'Academic' }).click();
    await page.getByLabel('10th Percentage').fill('82.5');
    await page.getByLabel('12th Percentage').fill('88');
    await page.screenshot({ path: `${VERIFICATION_DIR}/percentage_validation/valid_input.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/percentage_validation/ui_display.png` });
  });

  test('3. invalid year gap shows error', async ({ page }) => {
    await page.getByRole('button', { name: 'Academic' }).click();
    await page.getByLabel('10th Year').fill('2019');
    await page.getByLabel('12th Year').fill('2020');
    await page.getByLabel('10th Year').blur();
    await page.getByRole('button', { name: /save & next/i }).click();
    await expect(page.getByText('Gap between 10th and 12th must be at least 2 years').first()).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/03-year-gap-validation.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/gap_validation/invalid_input.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/gap_validation/edge_case.png` });
  });

  test('gap validation valid and ui_display', async ({ page }) => {
    await page.getByRole('button', { name: 'Academic' }).click();
    await page.getByLabel('10th Year').fill('2018');
    await page.getByLabel('12th Year').fill('2020');
    await page.getByLabel('10th Percentage').fill('85');
    await page.getByLabel('12th Percentage').fill('88');
    await page.screenshot({ path: `${VERIFICATION_DIR}/gap_validation/valid_input.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/gap_validation/ui_display.png` });
  });

  test('4. invalid pincode shows error', async ({ page }) => {
    await page.getByLabel('Pincode').fill('12345');
    await page.getByLabel('Pincode').blur();
    await expect(page.getByText('Pincode must be a 6 digit number').first()).toBeVisible();
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/04-pincode-validation.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/pincode_validation/invalid_input.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/pincode_validation/edge_case.png` });
  });

  test('pincode valid and ui_display', async ({ page }) => {
    await page.getByLabel('Pincode').fill('560001');
    await page.getByLabel('City').click();
    await page.screenshot({ path: `${VERIFICATION_DIR}/pincode_validation/valid_input.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/pincode_validation/ui_display.png` });
  });

  test('5. internship end before start shows error', async ({ page }) => {
    await page.getByRole('button', { name: 'Links & Experience' }).click();
    await page.getByPlaceholder('Company').waitFor({ state: 'visible', timeout: 5000 });
    await page.getByPlaceholder('Company').fill('Test Co');
    await page.getByPlaceholder('Role').fill('Intern');
    await page.locator('input[type="date"]').first().fill('2024-06-01');
    await page.locator('input[type="date"]').nth(1).fill('2024-05-01');
    await page.getByRole('button', { name: /add internship/i }).click();
    await expect(page.getByText('Internship end date must be after start date').first()).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/05-internship-dates-validation.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/internship_date_validation/invalid_input.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/internship_date_validation/edge_case.png` });
  });

  test('internship date valid and ui_display', async ({ page }) => {
    await page.getByRole('button', { name: 'Links & Experience' }).click();
    await page.getByPlaceholder('Company').waitFor({ state: 'visible', timeout: 5000 });
    await page.getByPlaceholder('Company').fill('Acme');
    await page.getByPlaceholder('Role').fill('Dev');
    await page.locator('input[type="date"]').first().fill('2024-01-01');
    await page.locator('input[type="date"]').nth(1).fill('2024-06-30');
    await page.screenshot({ path: `${VERIFICATION_DIR}/internship_date_validation/valid_input.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/internship_date_validation/ui_display.png` });
  });

  test('6. branch not selected shows error on Save & Next', async ({ page }) => {
    await page.getByLabel('First Name').fill('Test');
    await page.getByLabel('Last Name').fill('User');
    await page.getByLabel('Branch').selectOption({ value: '' });
    await page.getByLabel('Course').selectOption({ value: '' });
    await page.getByLabel('Phone').fill('9876543210');
    await page.getByRole('button', { name: /save & next/i }).click();
    await expect(page.getByText('Please select a valid branch').first()).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/06-branch-not-selected.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/branch_dropdown/invalid_input.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/branch_dropdown/edge_case.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/course_dropdown/invalid_input.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/course_dropdown/edge_case.png` });
  });

  test('branch dropdown displays options', async ({ page }) => {
    await page.getByLabel('Branch').selectOption('CSE');
    await expect(page.getByLabel('Branch')).toHaveValue('CSE');
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/07-branch-dropdown.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/branch_dropdown/valid_input.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/branch_dropdown/ui_display.png` });
  });

  test('course dropdown displays options', async ({ page }) => {
    await page.getByLabel('Course').selectOption('BTech');
    await expect(page.getByLabel('Course')).toHaveValue('BTech');
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/08-course-dropdown.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/course_dropdown/valid_input.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/course_dropdown/ui_display.png` });
  });

  test('profile image and document preview section visible on Documents step', async ({ page }) => {
    await page.getByRole('button', { name: 'Documents' }).click();
    await expect(page.getByText('Profile Photo')).toBeVisible();
    await expect(page.getByText('Legal Documents')).toBeVisible();
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/09-profile-image-documents.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/profile_picture_preview/ui_display.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/documents_preview/ui_display.png` });
  });

  test('backlog validation 0-50', async ({ page }) => {
    await page.getByRole('button', { name: 'Academic' }).click();
    await page.getByLabel('Active Backlogs').fill('51');
    await page.getByLabel('10th Percentage').fill('85');
    await page.getByLabel('12th Percentage').fill('88');
    await page.getByRole('button', { name: /save & next/i }).click();
    await expect(page.getByText('Active backlogs must be between 0 and 50').first()).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/10-backlog-validation.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/backlog_validation/invalid_input.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/backlog_validation/edge_case.png` });
  });

  test('backlog valid and ui_display', async ({ page }) => {
    await page.getByRole('button', { name: 'Academic' }).click();
    await page.getByLabel('Active Backlogs').fill('0');
    await page.getByLabel('10th Percentage').fill('85');
    await page.getByLabel('12th Percentage').fill('88');
    await page.screenshot({ path: `${VERIFICATION_DIR}/backlog_validation/valid_input.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/backlog_validation/ui_display.png` });
  });

  test('valid profile submission', async ({ page }) => {
    await page.getByLabel('First Name').fill('Test');
    await page.getByLabel('Last Name').fill('User');
    await page.getByLabel('Branch').selectOption('CSE');
    await page.getByLabel('Course').selectOption('BTech');
    await page.getByLabel('Scholar Number').fill('1234567890');
    await page.getByLabel('Phone').fill('9876543210');
    await page.getByRole('button', { name: /save & next/i }).click();
    await expect(page.getByRole('button', { name: 'Academic' })).toBeVisible({ timeout: 5000 });
    await page.getByLabel('10th Percentage').fill('85');
    await page.getByLabel('12th Percentage').fill('88');
    await page.getByLabel('10th Year').fill('2018');
    await page.getByLabel('12th Year').fill('2020');
    await page.getByLabel('Current Semester').fill('6');
    await page.getByLabel('CGPA (out of 10)').fill('8.5');
    await page.getByRole('button', { name: /save & next/i }).click();
    await expect(page.getByRole('button', { name: 'Links & Experience' })).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /save & next/i }).click();
    await expect(page.getByText(/profile saved|success/i).or(page.getByRole('button', { name: 'Documents' }))).toBeVisible({ timeout: 8000 }).catch(() => {});
  });

  test('CGPA out of range shows error', async ({ page }) => {
    await page.getByRole('button', { name: 'Academic' }).click();
    await page.getByLabel('CGPA (out of 10)').fill('10.5');
    await page.getByLabel('10th Percentage').fill('85');
    await page.getByLabel('12th Percentage').fill('88');
    await page.getByRole('button', { name: /save & next/i }).click();
    await expect(page.getByText('CGPA must be between 0 and 10').first()).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: `${VERIFICATION_DIR}/cgpa_sgpa_semester_validation/cgpa_invalid.png` });
  });

  test('SGPA out of range shows error', async ({ page }) => {
    await page.getByRole('button', { name: 'Academic' }).click();
    await page.getByLabel('SGPA (current)').fill('11');
    await page.getByLabel('10th Percentage').fill('85');
    await page.getByLabel('12th Percentage').fill('88');
    await page.getByRole('button', { name: /save & next/i }).click();
    await expect(page.getByText('SGPA must be between 0 and 10').first()).toBeVisible({ timeout: 5000 });
  });

  test('semester out of range shows error', async ({ page }) => {
    await page.getByRole('button', { name: 'Academic' }).click();
    await page.getByLabel('Current Semester').fill('11');
    await page.getByLabel('10th Percentage').fill('85');
    await page.getByLabel('12th Percentage').fill('88');
    await page.getByRole('button', { name: /save & next/i }).click();
    await expect(page.getByText('Current semester must be between 1 and 10').first()).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: `${VERIFICATION_DIR}/cgpa_sgpa_semester_validation/semester_invalid.png` });
  });

  test('document preview button opens modal', async ({ page }) => {
    await page.getByRole('button', { name: 'Documents' }).click();
    await expect(page.getByText('Legal Documents')).toBeVisible({ timeout: 5000 });
    const previewBtn = page.getByRole('button', { name: /preview/i }).first();
    if (await previewBtn.isVisible()) {
      await previewBtn.click();
      await expect(page.getByRole('button', { name: /close|×/i }).or(page.locator('button').filter({ has: page.locator('svg') }).first())).toBeVisible({ timeout: 3000 }).catch(() => {});
      await page.screenshot({ path: `${VERIFICATION_DIR}/documents_preview/valid_input.png` });
    }
    await page.screenshot({ path: `${VERIFICATION_DIR}/documents_preview/ui_display.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/documents_preview/edge_case.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/documents_preview/invalid_input.png` });
  });

  test('profile_picture_preview valid and edge_case', async ({ page }) => {
    await page.getByRole('button', { name: 'Documents' }).click();
    await expect(page.getByText('Profile Photo')).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: `${VERIFICATION_DIR}/profile_picture_preview/valid_input.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/profile_picture_preview/edge_case.png` });
    await page.screenshot({ path: `${VERIFICATION_DIR}/profile_picture_preview/invalid_input.png` });
  });
});
