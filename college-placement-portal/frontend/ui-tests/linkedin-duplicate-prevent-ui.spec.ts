import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';

const ROOT = 'verification_screenshots/linkedin_lifecycle_ui';
fs.mkdirSync(ROOT, { recursive: true });

async function loginCoordinator(page: Page) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').fill('coord@example.com');
  await page.getByPlaceholder('Enter your password').fill('Pass@123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/admin|\/jobs-management|\/dashboard/, { timeout: 20000 });
}

test('coordinator flow prevents duplicate linkedin content', async ({ page }) => {
  await loginCoordinator(page);

  await page.goto('/jobs-management', { waitUntil: 'networkidle' });
  await expect(page.locator('[data-testid=\"spoc-job-card\"]').first()).toBeVisible({ timeout: 20000 });

  const cards = page.locator('[data-testid=\"spoc-job-card\"]');
  const count = await cards.count();
  let targetIdx = 0;
  let maxApplicants = -1;
  for (let i = 0; i < count; i++) {
    const text = await cards.nth(i).innerText();
    const match = text.match(/(\\d+)\\s+applicants/i);
    const applicants = match ? Number(match[1]) : 0;
    if (applicants > maxApplicants) {
      maxApplicants = applicants;
      targetIdx = i;
    }
  }

  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });

  await cards.nth(targetIdx).locator('button[title=\"Manage Details\"]').click();
  await expect(page.getByTestId('job-details-page')).toBeVisible({ timeout: 20000 });

  const rows = page.locator('[data-testid=\"applicant-table\"] tbody tr');
  if (await rows.count()) {
    await rows.first().locator('input[type=\"checkbox\"]').check({ force: true });
  }
  const declareBtn = page.getByRole('button', { name: /Declare Placed/i });
  if (await declareBtn.count()) {
    await declareBtn.click();
  }

  await expect(page.getByTestId('placed-company-panel')).toBeVisible();
  const caption = page.getByTestId('linkedin-caption-template');
  const duplicateTemplate = '🎉 Duplicate Control Test\\nThis content should be blocked on second publish.';
  await caption.fill(duplicateTemplate);

  const publishBtn = page.getByTestId('publish-linkedin-btn');
  await publishBtn.click();
  await expect(page.getByText(/published|logged|announcement/i)).toBeVisible({ timeout: 20000 });

  await publishBtn.click();
  await expect(page.getByText(/Duplicate content prevented/i)).toBeVisible({ timeout: 20000 });

  await page.goto('/admin', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'LinkedIn' }).click();
  await expect(page.getByText('Publish History')).toBeVisible();
  await expect(page.getByText('FAILED').first()).toBeVisible({ timeout: 20000 });

  await page.screenshot({ path: `${ROOT}/duplicate_prevented_ui.png`, fullPage: true });
});

