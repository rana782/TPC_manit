import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const ROOT = 'verification_screenshots/analytics_redesign';
for (const d of ['search_by_name', 'search_by_company']) {
  fs.mkdirSync(`${ROOT}/${d}`, { recursive: true });
}

async function loginStudent(page: import('@playwright/test').Page) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').fill('student@example.com');
  await page.getByPlaceholder('Enter your password').fill('Pass@123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard|\/jobs-management|\/admin/, { timeout: 20000 });
}

test('alumni search works by name and company for authenticated user', async ({ page }) => {
  await loginStudent(page);

  await page.route('**/api/alumni/search**', (route) => {
    const url = route.request().url().toLowerCase();
    if (url.includes('q=rahul')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [{ id: 'a1', name: 'Rahul Sharma', branch: 'CSE', companyName: 'TCS', role: 'SDE', ctc: '9 LPA', placementYear: 2024, linkedinUrl: null }]
        })
      });
    }
    if (url.includes('q=tcs')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [{ id: 'a2', name: 'Ananya Das', branch: 'ECE', companyName: 'TCS', role: 'Analyst', ctc: '7 LPA', placementYear: 2023, linkedinUrl: 'https://linkedin.com/in/ananya' }]
        })
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
  });

  await page.goto('/alumni', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('alumni-directory-page')).toBeVisible();

  await page.getByPlaceholder('Search by alumni name or company...').fill('Rahul');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByText('Rahul Sharma')).toBeVisible();
  await page.screenshot({ path: `${ROOT}/search_by_name/valid_case.png`, fullPage: true });
  await page.screenshot({ path: `${ROOT}/search_by_name/ui_state.png`, fullPage: true });

  await page.getByPlaceholder('Search by alumni name or company...').fill('TCS');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByText('Ananya Das')).toBeVisible();
  await page.screenshot({ path: `${ROOT}/search_by_company/valid_case.png`, fullPage: true });
  await page.screenshot({ path: `${ROOT}/search_by_company/ui_state.png`, fullPage: true });
});
