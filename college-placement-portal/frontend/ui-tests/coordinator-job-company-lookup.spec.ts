import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const API_BASE = 'http://localhost:5001/api';
const COORD_EMAIL = 'ui_coord@example.com';
const PASSWORD = 'Password@123';
const ROOT = 'verification_screenshots/company_profile_db';
const EDGE_DIR = `${ROOT}/edge_cases`;

test.beforeAll(() => {
  fs.mkdirSync(EDGE_DIR, { recursive: true });
});

test('coordinator company lookup handles mixed-case and unknown', async ({ page }) => {
  await page.request.get(`${API_BASE}/seed/seed-ui-coordinator`);
  const loginRes = await page.request.post(`${API_BASE}/auth/login`, {
    data: { email: COORD_EMAIL, password: PASSWORD }
  });
  expect(loginRes.ok()).toBeTruthy();
  const loginData = await loginRes.json();
  const token = loginData?.token as string;

  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.evaluate((authToken) => {
    localStorage.setItem('token', authToken);
  }, token);
  await page.goto('/jobs-management', { waitUntil: 'networkidle' });
  await expect(page.getByRole('button', { name: /post new job/i }).first()).toBeVisible({ timeout: 20000 });

  await page.getByRole('button', { name: /post new job/i }).click();
  await page.locator('form#jobForm input[type="text"]').first().fill('TcS');
  await expect(page.getByText('TCS', { exact: true }).first()).toBeVisible();
  const form = page.locator('form#jobForm');
  await page.locator('form#jobForm input[type="text"]').first().fill('Unknown Corp');
  await expect(form.getByText(/Rating not available/i).first()).toBeVisible();
  await expect(form.getByText(/Reviews not available/i).first()).toBeVisible();
  await page.screenshot({ path: `${EDGE_DIR}/valid_case.png`, fullPage: true });
  await page.screenshot({ path: `${EDGE_DIR}/invalid_case.png`, fullPage: true });
  await page.screenshot({ path: `${EDGE_DIR}/edge_case.png`, fullPage: true });
  await page.screenshot({ path: `${EDGE_DIR}/ui_state.png`, fullPage: true });
});

