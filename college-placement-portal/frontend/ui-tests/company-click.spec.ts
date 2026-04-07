import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const ROOT = 'verification_screenshots/company_drilldown';
for (const d of ['click_company', 'insights_panel']) {
  fs.mkdirSync(`${ROOT}/${d}`, { recursive: true });
}

const alumni = [
  { id: '1', name: 'Rahul Sharma', branch: 'CSE', companyName: 'TCS', role: 'SDE', ctc: '9 LPA', placementYear: 2024, linkedinUrl: null },
  { id: '2', name: 'Ananya Das', branch: 'ECE', companyName: 'TCS', role: 'Analyst', ctc: '8 LPA', placementYear: 2023, linkedinUrl: null },
  { id: '3', name: 'Vikram Rao', branch: 'CSE', companyName: 'Infosys', role: 'SE', ctc: '7 LPA', placementYear: 2024, linkedinUrl: null }
];

async function loginSpoc(page: import('@playwright/test').Page) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').fill('spoc@example.com');
  await page.getByPlaceholder('Enter your password').fill('Pass@123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/jobs-management|\/dashboard/, { timeout: 20000 });
}

test('click company drills down alumni instantly', async ({ page }) => {
  await loginSpoc(page);
  await page.route('**/api/alumni/search**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: alumni }) })
  );

  await page.goto('/alumni', { waitUntil: 'networkidle' });
  await expect(page.getByText('Rahul Sharma')).toBeVisible();
  await page.getByTestId('alumni-company-link').first().click();
  await expect(page.getByTestId('company-insights-panel')).toBeVisible();
  await expect(page.getByText('Company Drill-down')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'TCS' })).toBeVisible();
  await expect(page.getByText('Vikram Rao')).toHaveCount(0);

  await page.screenshot({ path: `${ROOT}/click_company/valid_case.png`, fullPage: true });
  await page.screenshot({ path: `${ROOT}/insights_panel/ui_state.png`, fullPage: true });
});
