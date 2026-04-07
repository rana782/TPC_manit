import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const ROOT = 'verification_screenshots/company_drilldown';
for (const d of ['back_navigation', 'filtered_view']) {
  fs.mkdirSync(`${ROOT}/${d}`, { recursive: true });
}

const allAlumni = [
  { id: '1', name: 'Rahul Sharma', branch: 'CSE', companyName: 'TCS', role: 'SDE', ctc: '9 LPA', placementYear: 2024, linkedinUrl: null },
  { id: '2', name: 'Neha Singh', branch: 'ECE', companyName: 'TCS', role: 'Analyst', ctc: '8 LPA', placementYear: 2023, linkedinUrl: null },
  { id: '3', name: 'Kiran Patel', branch: 'CSE', companyName: 'Infosys', role: 'SE', ctc: '7 LPA', placementYear: 2024, linkedinUrl: null }
];

function filterDataset(url: string) {
  const u = new URL(url);
  const q = (u.searchParams.get('q') || '').toLowerCase();
  const branch = u.searchParams.get('branch') || '';
  return allAlumni.filter((a) => {
    const qOk = !q || a.name.toLowerCase().includes(q) || a.companyName.toLowerCase().includes(q);
    const bOk = !branch || branch === 'All' || a.branch === branch;
    return qOk && bOk;
  });
}

async function loginSpoc(page: import('@playwright/test').Page) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').fill('spoc@example.com');
  await page.getByPlaceholder('Enter your password').fill('Pass@123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/jobs-management|\/dashboard/, { timeout: 20000 });
}

test('branch filter + company drilldown + back navigation', async ({ page }) => {
  await loginSpoc(page);

  await page.route('**/api/alumni/search**', (route) => {
    const data = filterDataset(route.request().url());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
  });

  await page.goto('/alumni', { waitUntil: 'networkidle' });
  // branch dropdown is first select, year is second
  await page.getByRole('combobox').first().selectOption('CSE');
  await page.getByRole('button', { name: 'Search' }).click();

  await expect(page.getByText('Rahul Sharma')).toBeVisible();
  await expect(page.getByText('Neha Singh')).toHaveCount(0);

  await page.getByRole('button', { name: 'TCS' }).first().click();
  await expect(page.getByTestId('company-insights-panel')).toBeVisible();
  await expect(page.getByText('Rahul Sharma')).toBeVisible();
  await expect(page.getByText('Neha Singh')).toHaveCount(0);
  await page.screenshot({ path: `${ROOT}/filtered_view/valid_case.png`, fullPage: true });

  await page.getByTestId('company-drilldown-back').click();
  await expect(page.getByTestId('company-insights-panel')).toHaveCount(0);
  await expect(page.getByText('Rahul Sharma')).toBeVisible();
  await page.screenshot({ path: `${ROOT}/back_navigation/valid_case.png`, fullPage: true });
});
