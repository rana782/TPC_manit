import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';

const ROOT = 'verification_screenshots/linkedin_lifecycle_ui';
fs.mkdirSync(ROOT, { recursive: true });

const API_BASE = 'http://localhost:5001/api';

async function loginAsCoordinator(page: Page) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').fill('coord@example.com');
  await page.getByPlaceholder('Enter your password').fill('Pass@123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/admin|\/jobs-management|\/dashboard/, { timeout: 20000 });
}

test('declare placed to linkedin publish lifecycle via UI', async ({ page, request }) => {
  const spocLogin = await request.post(`${API_BASE}/auth/login`, {
    data: { email: 'spoc@example.com', password: 'Pass@123' }
  });
  const spocJson = await spocLogin.json();
  expect(spocJson?.token).toBeTruthy();
  const jobsRes = await request.get(`${API_BASE}/jobs`, {
    headers: { Authorization: `Bearer ${spocJson.token}` }
  });
  const jobsJson = await jobsRes.json();
  const targetJob = (jobsJson?.jobs || []).find((j: any) => j.companyName === 'Seed Timeline Alpha') || jobsJson?.jobs?.[0];
  expect(targetJob?.id).toBeTruthy();

  await loginAsCoordinator(page);
  await page.goto(`/jobs/${targetJob.id}/details`, { waitUntil: 'networkidle' });
  await expect(page.getByTestId('job-details-page')).toBeVisible();

  // Try full lifecycle from selection -> declare placed.
  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });
  const firstRowCheckbox = page.locator('[data-testid="applicant-table"] tbody tr').first().locator('input[type="checkbox"]');
  if (await firstRowCheckbox.count()) {
    await firstRowCheckbox.check({ force: true });
  }
  const declareBtn = page.getByRole('button', { name: /Declare Placed/i });
  if (await declareBtn.count()) {
    await declareBtn.click();
    await expect(page.getByText(/declared as placed/i)).toBeVisible({ timeout: 15000 });
  }

  // Verify placed list extraction + editable caption + publish flow.
  await expect(page.getByTestId('placed-company-panel')).toBeVisible();
  await expect(page.getByTestId('placed-company-student-row').first()).toBeVisible();
  const linkedInIcon = page.getByTestId('placed-student-linkedin');
  const linkedInCount = await linkedInIcon.count();
  expect(linkedInCount).toBeGreaterThan(0);
  await expect(linkedInIcon.first()).toBeVisible();
  const href = await linkedInIcon.first().getAttribute('href');
  expect(href).toContain('linkedin.com');

  const caption = page.getByTestId('linkedin-caption-template');
  await expect(caption).toBeVisible();
  await caption.fill('🎉 Congratulations from TPC!\\nCustom editable caption test.');

  const publishBtn = page.getByTestId('publish-linkedin-btn');
  await publishBtn.click();
  await expect(page.getByText(/published|logged|announcement/i)).toBeVisible({ timeout: 20000 });

  await page.screenshot({ path: `${ROOT}/lifecycle_success.png`, fullPage: true });
});

