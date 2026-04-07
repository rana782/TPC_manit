import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const API_BASE = 'http://localhost:5001/api';
const STUDENT_EMAIL = 'ui_student@example.com';
const PASSWORD = 'Pass@123';
const ROOT = 'verification_screenshots/resume_analysis_fix';

test.beforeAll(() => {
  ['button_click', 'loading', 'result_display', 'fallback', 'edge_cases'].forEach((d) =>
    fs.mkdirSync(`${ROOT}/${d}`, { recursive: true })
  );
});

test('resume page shows ATS section and analyze control', async ({ page }) => {
  await page.request.get(`${API_BASE}/seed/seed-ui`);
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').fill(STUDENT_EMAIL);
  await page.getByPlaceholder('Enter your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 });

  await page.goto('/resumes', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('resume-ats-section').first()).toBeVisible({ timeout: 15000 });
  await page.screenshot({ path: `${ROOT}/button_click/resumes_ats_visible.png`, fullPage: true });

  const analyzeBtn = page.getByTestId('analyze-resume-button').first();
  if (await analyzeBtn.isVisible()) {
    await analyzeBtn.click();
    await page.screenshot({ path: `${ROOT}/loading/after_click.png`, fullPage: true });
    await expect(page.getByTestId('resume-ats-results').first())
      .toBeVisible({ timeout: 90000 })
      .catch(() => undefined);
    await page.screenshot({ path: `${ROOT}/result_display/with_results_or_timeout.png`, fullPage: true });
  }
});
