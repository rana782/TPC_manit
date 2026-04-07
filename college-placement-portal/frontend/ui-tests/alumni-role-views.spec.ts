import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const ROOT = 'verification_screenshots/analytics_redesign';
for (const d of ['alumni_student_view', 'alumni_spoc_view', 'alumni_coordinator_view']) {
  fs.mkdirSync(`${ROOT}/${d}`, { recursive: true });
}

async function loginAs(page: import('@playwright/test').Page, email: string) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('Enter your password').fill('Pass@123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard|\/jobs-management|\/admin/, { timeout: 20000 });
}

test('alumni page is accessible for student, spoc and coordinator', async ({ browser }) => {
  const cases = [
    { email: 'student@example.com', folder: 'alumni_student_view' },
    { email: 'spoc@example.com', folder: 'alumni_spoc_view' },
    { email: 'coord@example.com', folder: 'alumni_coordinator_view' }
  ];

  for (const c of cases) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, c.email);
    await page.goto('/alumni', { waitUntil: 'networkidle' });
    await expect(page.getByTestId('alumni-directory-page')).toBeVisible();
    await expect(page.getByText('Global Alumni Search')).toBeVisible();
    await page.screenshot({ path: `${ROOT}/${c.folder}/valid_case.png`, fullPage: true });
    await page.screenshot({ path: `${ROOT}/${c.folder}/ui_state.png`, fullPage: true });
    await ctx.close();
  }
});
