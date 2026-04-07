import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const ROOT = 'verification_screenshots/analytics_redesign';
for (const d of ['branch_wise_stats', 'timeline_view', 'edge_cases']) {
  fs.mkdirSync(`${ROOT}/${d}`, { recursive: true });
}

async function loginSpoc(page: import('@playwright/test').Page) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').fill('spoc@example.com');
  await page.getByPlaceholder('Enter your password').fill('Pass@123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/jobs-management|\/dashboard/, { timeout: 20000 });
}

test('branch-wise analytics renders and removed cards are gone', async ({ page }) => {
  await loginSpoc(page);

  await page.route('**/api/analytics/branch-wise-current', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        branchWise: [
          {
            branch: 'CSE',
            placedCount: 42,
            averagePackage: 9.8,
            medianPackage: 9.0,
            timeline: [{ label: '2024-01', value: 10 }, { label: '2024-02', value: 12 }],
            companyDistribution: [{ companyName: 'TCS', count: 8 }]
          },
          {
            branch: 'ECE',
            placedCount: 12,
            averagePackage: 7.2,
            medianPackage: 6.8,
            timeline: [{ label: '2024-01', value: 3 }, { label: '2024-02', value: 5 }],
            companyDistribution: [{ companyName: 'Infosys', count: 4 }]
          }
        ]
      })
    })
  );

  await page.goto('/analytics', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('analytics-redesign-page')).toBeVisible();
  await expect(page.getByText('Branch-wise currently placed details')).toBeVisible();
  await expect(page.getByText('Branch: CSE')).toBeVisible();
  await expect(page.getByText('Timeline analytics (branch-wise)')).toBeVisible();
  await expect(page.getByText('Top Target Companies')).toHaveCount(0);
  await expect(page.getByText('Active Recruitment Branches')).toHaveCount(0);

  await page.screenshot({ path: `${ROOT}/branch_wise_stats/valid_case.png`, fullPage: true });
  await page.screenshot({ path: `${ROOT}/branch_wise_stats/ui_state.png`, fullPage: true });
  await page.screenshot({ path: `${ROOT}/timeline_view/valid_case.png`, fullPage: true });
  await page.screenshot({ path: `${ROOT}/edge_cases/edge_case.png`, fullPage: true });
});
