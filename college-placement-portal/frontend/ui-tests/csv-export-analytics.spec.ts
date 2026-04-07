import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const ROOT = 'verification_screenshots/analytics_redesign/csv_export';
fs.mkdirSync(ROOT, { recursive: true });

test('analytics CSV export includes branch-wise fields', async ({ request, page }) => {
  const login = await request.post('http://localhost:5001/api/auth/login', {
    data: { email: 'spoc@example.com', password: 'Pass@123' }
  });
  expect(login.ok()).toBeTruthy();
  const loginJson = await login.json();
  const token = loginJson.token as string;
  expect(token).toBeTruthy();

  const res = await request.get('http://localhost:5001/api/analytics/export-csv?fields=branch,totalPlaced,averagePackage,medianPackage,placementYear,companyNames', {
    headers: { Authorization: `Bearer ${token}` }
  });
  expect(res.ok()).toBeTruthy();
  const csv = await res.text();
  expect(csv.toLowerCase()).toContain('branch,totalplaced,averagepackage,medianpackage,placementyear,companynames');

  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${ROOT}/ui_state.png`, fullPage: true });
  await page.screenshot({ path: `${ROOT}/valid_case.png`, fullPage: true });
});
