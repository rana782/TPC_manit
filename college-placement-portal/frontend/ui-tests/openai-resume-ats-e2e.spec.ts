/**
 * End-to-end: Resumes → Get ATS score uses Qwen via OpenRouter (not fallback) when ATS_LLM_API_KEY is set.
 *
 * Prereqs: PostgreSQL, backend `npm run dev` (backend/.env with OpenRouter key + ATS_LLM_BASE_URL), frontend `npm run dev`.
 * Run: `cd frontend && npx playwright test ui-tests/openai-resume-ats-e2e.spec.ts`
 * Optional: `E2E_API_URL=http://localhost:5001` if API port differs.
 */
import { test, expect } from '@playwright/test';

const API_BASE = process.env.E2E_API_URL || 'http://localhost:5001';
const STUDENT_EMAIL = 'ui_student@example.com';
/** Must match `GET /api/seed/seed-ui` in backend (`Password@123`). */
const PASSWORD = 'Password@123';

test.describe('Resume standalone ATS (Qwen / OpenRouter)', () => {
  test('health reports LLM configured; UI gets llm engine after analyze', async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Single viewport; use --project=desktop');
    const health = await request.get(`${API_BASE}/api/health`);
    expect(health.ok()).toBeTruthy();
    const healthJson = await health.json();
    expect(healthJson.success).toBe(true);
    const configured = Boolean(healthJson?.data?.atsLlmConfigured ?? healthJson?.data?.openaiConfigured);
    test.skip(
      !configured,
      'Backend reports atsLlmConfigured=false — set ATS_LLM_API_KEY and ATS_LLM_BASE_URL in backend/.env and restart the API'
    );

    await request.get(`${API_BASE}/api/seed/seed-ui`);
    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.getByPlaceholder('you@example.com').fill(STUDENT_EMAIL);
    await page.getByPlaceholder('Enter your password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 });

    await page.goto('/resumes', { waitUntil: 'networkidle' });
    await expect(page.getByTestId('resume-ats-section').first()).toBeVisible({ timeout: 15000 });

    await page.getByTestId('analyze-resume-button').first().click();

    const results = page.getByTestId('resume-ats-results').first();
    await expect(results).toBeVisible({ timeout: 120000 });
    await expect(results).toHaveAttribute('data-ats-engine', 'llm', { timeout: 120000 });

    await expect(results.getByText(/API key not set/i)).toHaveCount(0);
    await expect(results.getByText(/analysis used a fallback/i)).toHaveCount(0);
  });
});
