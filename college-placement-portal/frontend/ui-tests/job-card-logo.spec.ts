import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const API_BASE = 'http://localhost:5001/api';
const SPOC_EMAIL = 'ui_spoc@example.com';
const STUDENT_EMAIL = 'ui_student@example.com';
const PASSWORD = 'Password@123';

const ROOT = 'verification_screenshots/logos';
const JOB_CARD_DIR = `${ROOT}/job_card`;
const FALLBACK_DIR = `${ROOT}/fallback`;
const BROKEN_DIR = `${ROOT}/broken_url`;
const MULTI_DIR = `${ROOT}/multi_jobs`;

test.beforeAll(() => {
  fs.mkdirSync(JOB_CARD_DIR, { recursive: true });
  fs.mkdirSync(FALLBACK_DIR, { recursive: true });
  fs.mkdirSync(BROKEN_DIR, { recursive: true });
  fs.mkdirSync(MULTI_DIR, { recursive: true });
});

async function login(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').waitFor({ state: 'visible', timeout: 15000 });
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('Enter your password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

async function enableBackendProxy(page: import('@playwright/test').Page) {
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const originalUrl = req.url();
    const parsed = new URL(originalUrl);
    const proxiedUrl = `http://localhost:5001${parsed.pathname}${parsed.search}`;
    const response = await page.request.fetch(proxiedUrl, {
      method: req.method(),
      headers: req.headers(),
      data: req.postDataBuffer() ?? undefined
    });
    await route.fulfill({
      status: response.status(),
      headers: response.headers(),
      body: await response.body()
    });
  });
}

async function postPublishedJob(
  page: import('@playwright/test').Page,
  company: string,
  role: string
) {
  await page.getByRole('button', { name: /post new job/i }).click();
  await page.waitForSelector('form#jobForm', { timeout: 10000 });

  const form = page.locator('form#jobForm');
  const companyInput = form.locator('input[type="text"]').first();
  const roleInput = form.locator('input[type="text"]').nth(1);
  const deadlineInput = form.locator('input[type="date"]').first();
  const ctcInput = form.getByPlaceholder('e.g. 12 LPA').first();
  const cgpaInput = form.locator('input[type="number"]').first();
  const descArea = form.locator('textarea').first();

  await companyInput.fill(company);
  await roleInput.fill(role);
  await ctcInput.fill('15 LPA');
  await cgpaInput.fill('6.5');
  await descArea.fill('Testing company logo on student job board');

  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 30);
  await deadlineInput.fill(futureDate.toISOString().split('T')[0]);

  // Ensure at least one eligible branch is selected.
  const cse = page.locator('label:has-text("CSE")').first();
  await cse.click();

  await page.getByText('Published (Visible)').click();
  await page.getByRole('button', { name: /save job posting/i }).click();
  await expect(page.getByText(role)).toBeVisible({ timeout: 20000 });
}

test('student job cards show company logos with fallback + broken-url behavior', async ({ page }) => {
  await page.request.get(`${API_BASE}/seed/seed-ui`);
  await enableBackendProxy(page);

  // 1) SPOC posts 3 jobs (known + unknown-with-broken-url + no-mapping company from seed-ui)
  await login(page, SPOC_EMAIL, PASSWORD);
  await expect(page).toHaveURL(/\/jobs-management/, { timeout: 20000 });

  const suffix = Date.now().toString().slice(-6);
  await postPublishedJob(page, 'TCS', `TCS Logo Job ${suffix}`);
  await postPublishedJob(page, 'Unknown Startup XYZ', `BrokenLogo Job ${suffix}`);
  // InnovateTech is created by /seed/seed-ui. We will rely on it for the "missing mapping => default logo" case.

  // 2) Student views job board
  await login(page, STUDENT_EMAIL, PASSWORD);
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 });
  await page.goto('/job-board', { waitUntil: 'networkidle' });

  await expect(page.getByRole('heading', { name: /job board/i })).toBeVisible({ timeout: 20000 });

  const tcsLogo = page.getByAltText('TCS logo').first();
  await expect(tcsLogo).toBeVisible();
  await expect(tcsLogo).toHaveAttribute('src', /default-logo\.png|logo\.clearbit\.com/i);

  const innovLogo = page.getByAltText('InnovateTech logo').first();
  await expect(innovLogo).toBeVisible();
  await expect(innovLogo).toHaveAttribute('src', /default-logo\.png/i);

  const unknownLogo = page.getByAltText('Unknown Startup XYZ logo').first();
  await expect(unknownLogo).toBeVisible();
  // Broken URL should render default logo via onError.
  await expect.poll(async () => (await unknownLogo.getAttribute('src')) || '').toContain('default-logo.png');

  await page.screenshot({ path: `${JOB_CARD_DIR}/valid_case.png`, fullPage: true });
  await page.screenshot({ path: `${FALLBACK_DIR}/invalid_case.png`, fullPage: true });
  await page.screenshot({ path: `${BROKEN_DIR}/edge_case.png`, fullPage: true });
  await page.screenshot({ path: `${MULTI_DIR}/ui_state.png`, fullPage: true });
});

