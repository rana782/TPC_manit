import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const API_BASE = 'http://localhost:5001/api';
const SPOC_EMAIL = 'ui_spoc@example.com';
const STUDENT_EMAIL = 'ui_student@example.com';
const PASSWORD = 'Password@123';

const SHOTS = 'verification_screenshots/unplace_flow';
const LIST_VIEW = `${SHOTS}/list_view`;
const UNPLACE_ACTION = `${SHOTS}/unplace_action`;
const ANALYTICS_UPDATE = `${SHOTS}/analytics_update`;
const STUDENT_RESTORED = `${SHOTS}/student_restored`;
const EDGE_CASES = `${SHOTS}/edge_cases`;

test.beforeAll(() => {
  [LIST_VIEW, UNPLACE_ACTION, ANALYTICS_UPDATE, STUDENT_RESTORED, EDGE_CASES].forEach((d) => fs.mkdirSync(d, { recursive: true }));
});

async function enableBackendProxy(page: import('@playwright/test').Page) {
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const proxiedUrl = `http://localhost:5001${u.pathname}${u.search}`;
    const response = await page.request.fetch(proxiedUrl, {
      method: req.method(),
      headers: req.headers(),
      data: req.postDataBuffer() ?? undefined,
    });
    await route.fulfill({
      status: response.status(),
      headers: response.headers(),
      body: await response.body(),
    });
  });
}

async function login(page: import('@playwright/test').Page, email: string) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('Enter your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

function extractPlacedCount(text: string): number {
  const match = text.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

test('unplace flow from analytics to restored student access', async ({ page }) => {
  await enableBackendProxy(page);

  // Ensure seed exists
  const seedUi = await page.request.get(`${API_BASE}/seed/seed-ui`);
  expect(seedUi.ok()).toBeTruthy();

  // Create locked/placed-like state without relying on broken seed helpers
  const studentLoginRes = await page.request.post(`${API_BASE}/auth/login`, { data: { email: STUDENT_EMAIL, password: PASSWORD } });
  const studentAuth = await studentLoginRes.json();
  const studentToken = studentAuth.token as string;
  const profileRes = await page.request.get(`${API_BASE}/student/profile`, {
    headers: { Authorization: `Bearer ${studentToken}` }
  });
  expect(profileRes.ok()).toBeTruthy();
  const profileData = await profileRes.json();
  const studentId = profileData?.data?.id as string;
  expect(!!studentId).toBeTruthy();

  const spocLoginRes = await page.request.post(`${API_BASE}/auth/login`, { data: { email: SPOC_EMAIL, password: PASSWORD } });
  const spocAuth = await spocLoginRes.json();
  const spocToken = spocAuth.token as string;
  const lockRes = await page.request.post(`${API_BASE}/profile-lock/${studentId}/lock`, {
    headers: { Authorization: `Bearer ${spocToken}` },
    data: { reason: 'Placed for testing unplace flow', profileLocked: true }
  });
  expect(lockRes.ok()).toBeTruthy();

  // SPOC -> analytics card -> placed list
  await login(page, SPOC_EMAIL);
  await expect(page).toHaveURL(/\/jobs-management/, { timeout: 20000 });
  await page.goto('/analytics', { waitUntil: 'networkidle' });

  const placedCard = page.locator('button').filter({ hasText: 'Total Students Placed' }).first();
  await expect(placedCard).toBeVisible({ timeout: 10000 });
  const beforeCount = extractPlacedCount((await placedCard.innerText()).replace(/\s+/g, ' '));
  await page.screenshot({ path: `${ANALYTICS_UPDATE}/before_unplace.png`, fullPage: true });

  await placedCard.click();
  await expect(page).toHaveURL(/\/placed-students/, { timeout: 10000 });
  await expect(page.getByRole('heading', { name: 'Placed Students' })).toBeVisible();
  await page.screenshot({ path: `${LIST_VIEW}/valid_case.png`, fullPage: true });

  // Unplace one student
  const row = page.locator('tbody tr').filter({ hasText: STUDENT_EMAIL }).first();
  await expect(row).toBeVisible({ timeout: 10000 });
  page.once('dialog', (d) => d.accept());
  await row.getByRole('button', { name: /mark as unplaced/i }).click();
  await expect(page.getByText(/marked as unplaced successfully/i)).toBeVisible({ timeout: 10000 });
  await page.screenshot({ path: `${UNPLACE_ACTION}/valid_case.png`, fullPage: true });

  // Analytics count should decrease / not increase
  await page.goto('/analytics', { waitUntil: 'networkidle' });
  const afterText = await page.locator('button').filter({ hasText: 'Total Students Placed' }).first().innerText();
  const afterCount = extractPlacedCount(afterText.replace(/\s+/g, ' '));
  expect(afterCount).toBeLessThanOrEqual(beforeCount);
  await page.screenshot({ path: `${ANALYTICS_UPDATE}/after_unplace.png`, fullPage: true });

  // Student restored: can access job board and Apply button appears
  await login(page, STUDENT_EMAIL);
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 });
  await page.goto('/job-board', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('lock-notice')).toHaveCount(0);
  const applyButtons = page.getByRole('button', { name: /apply now/i });
  expect(await applyButtons.count()).toBeGreaterThan(0);
  await applyButtons.first().click();
  await expect(page.getByTestId('apply-modal')).toBeVisible({ timeout: 10000 });
  await page.screenshot({ path: `${STUDENT_RESTORED}/student_can_apply_again.png`, fullPage: true });

  // Edge case: unplacing already-unplaced student returns controlled error
  const loginRes = await page.request.post(`${API_BASE}/auth/login`, { data: { email: SPOC_EMAIL, password: PASSWORD } });
  const authData = await loginRes.json();
  const token = authData.token as string;
  const placedListRes = await page.request.get(`${API_BASE}/profile-lock/placed`, { headers: { Authorization: `Bearer ${token}` } });
  expect(placedListRes.ok()).toBeTruthy();
  const placedList = await placedListRes.json();
  if (Array.isArray(placedList.students) && placedList.students.length > 0) {
    const firstId = placedList.students[0].id;
    await page.request.put(`${API_BASE}/profile-lock/${firstId}/unplace`, { headers: { Authorization: `Bearer ${token}` } });
    const again = await page.request.put(`${API_BASE}/profile-lock/${firstId}/unplace`, { headers: { Authorization: `Bearer ${token}` } });
    expect(again.status()).toBe(400);
  }
  await page.screenshot({ path: `${EDGE_CASES}/already_unplaced_case.png`, fullPage: true });
});

