import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const ROOT = 'verification_screenshots/company_drilldown';
for (const d of ['trend_chart', 'edge_cases']) {
  fs.mkdirSync(`${ROOT}/${d}`, { recursive: true });
}

const alumniWithTrend = [
  { id: '1', name: 'A', branch: 'CSE', companyName: 'TCS', role: 'SDE', ctc: '6 LPA', placementYear: 2022, linkedinUrl: null },
  { id: '2', name: 'B', branch: 'CSE', companyName: 'TCS', role: 'SDE', ctc: '8 LPA', placementYear: 2023, linkedinUrl: null },
  { id: '3', name: 'C', branch: 'CSE', companyName: 'TCS', role: 'SDE', ctc: '10 LPA', placementYear: 2024, linkedinUrl: null },
  { id: '4', name: 'D', branch: 'ECE', companyName: 'Accenture', role: 'Analyst', ctc: '', placementYear: 2024, linkedinUrl: null }
];

async function loginSpoc(page: import('@playwright/test').Page) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').fill('spoc@example.com');
  await page.getByPlaceholder('Enter your password').fill('Pass@123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/jobs-management|\/dashboard/, { timeout: 20000 });
}

test('company package trend chart is visible and handles missing package data', async ({ page }) => {
  await loginSpoc(page);
  await page.route('**/api/alumni/search**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: alumniWithTrend }) })
  );

  await page.goto('/alumni', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'TCS' }).first().click();
  await expect(page.getByTestId('company-trend-chart')).toBeVisible();
  await page.screenshot({ path: `${ROOT}/trend_chart/valid_case.png`, fullPage: true });

  // Edge: company with missing package values
  await page.getByTestId('company-drilldown-back').click();
  await page.getByRole('button', { name: 'Accenture' }).first().click();
  await expect(page.getByTestId('company-insights-panel')).toBeVisible();
  await page.screenshot({ path: `${ROOT}/edge_cases/edge_case.png`, fullPage: true });
});
