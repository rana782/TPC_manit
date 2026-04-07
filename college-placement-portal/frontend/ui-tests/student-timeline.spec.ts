import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const STUDENT_EMAIL = 'ui_student@example.com';
const STUDENT_PASSWORD = 'Password@123';
const API_BASE = 'http://localhost:5001/api';

const TIMELINE_DIR = 'verification_screenshots/student_module/application_timeline';

test.beforeAll(() => {
  fs.mkdirSync(TIMELINE_DIR, { recursive: true });
});

async function loginAsStudent(page: import('@playwright/test').Page) {
  const seedRes = await page.request.get(`${API_BASE}/seed/seed-ui`);
  expect(seedRes.ok()).toBeTruthy();
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').waitFor({ state: 'visible', timeout: 15000 });
  await page.getByPlaceholder('you@example.com').fill(STUDENT_EMAIL);
  await page.getByPlaceholder('Enter your password').fill(STUDENT_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
}

const jobStagesBase = [
  { id: 's0', name: 'Applied', scheduledDate: '2030-01-10T00:00:00.000Z' },
  { id: 's1', name: 'OA Round', scheduledDate: '2030-01-15T00:00:00.000Z' },
  { id: 's2', name: 'Technical Interview', scheduledDate: '2030-01-20T00:00:00.000Z' },
  { id: 's3', name: 'HR', scheduledDate: '2030-01-25T00:00:00.000Z' },
  { id: 's4', name: 'Offer', scheduledDate: '2030-01-30T00:00:00.000Z' },
] as const;

function renderAppPayload({ status, currentStageIndex, jobStages }: { status: string; currentStageIndex: number; jobStages: any[] }) {
  return {
    success: true,
    stats: { appliedJobs: 1, jobsOffered: 0, shortlisted: 0, profileLocked: false },
    applications: [
      {
        id: 'app1',
        status,
        currentStageIndex,
        createdAt: '2030-02-01T00:00:00.000Z',
        job: { role: 'Role', companyName: 'Comp', stages: jobStages, createdAt: '2030-03-01T00:00:00.000Z' },
      },
    ],
  };
}

test.describe('Student detailed application timeline (Dashboard)', () => {
  async function assertStagesInOrder(page: import('@playwright/test').Page, expectedOutcome: string) {
    const uiStageNames = (await page.locator('[data-testid="job-stage-name"]').allTextContents()).map((t) => t.trim());
    const expectedStageNames = jobStagesBase.map((s) => s.name);
    expect(uiStageNames).toEqual(expectedStageNames);

    const statusLines = page.locator('[data-testid="job-stage-status-line"]');
    await expect(statusLines).toHaveCount(expectedStageNames.length, { timeout: 10000 });

    const statuses = await statusLines.allTextContents();
    expect(statuses.join(' | ')).toContain('Completed');
    expect(statuses.join(' | ')).toContain('Current');
    expect(statuses.join(' | ')).toContain('Pending');

    if (expectedOutcome) {
      await expect(
        page.getByTestId('timeline-drawer').getByText(new RegExp(`Outcome:\\s*.*${expectedOutcome}`, 'i'))
      ).toBeVisible();
    }
  }

  test('valid_case (drawer shows job.stages only, completed/current/upcoming)', async ({ page }) => {
    await loginAsStudent(page);

    await page.route('**/api/applications', async (route) => {
      return route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(renderAppPayload({ status: 'ACCEPTED', currentStageIndex: 2, jobStages: [...jobStagesBase] })) });
    });

    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    await expect(page.getByTestId('timeline-drawer')).toHaveCount(0);

    await page.getByTestId('application-card').first().click();
    await expect(page.getByTestId('timeline-drawer')).toBeVisible();

    await assertStagesInOrder(page, 'Placed/Selected');
    await page.screenshot({ path: `${TIMELINE_DIR}/valid_case.png`, fullPage: true });
    await page.screenshot({ path: `${TIMELINE_DIR}/ui_state.png`, fullPage: true });
  });

  test('edge_case (missing scheduledDate renders TBD)', async ({ page }) => {
    await loginAsStudent(page);

    const jobStages = [
      ...jobStagesBase.slice(0, 2),
      { ...jobStagesBase[2], scheduledDate: null },
      ...jobStagesBase.slice(3),
    ];

    await page.route('**/api/applications', async (route) => {
      return route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(renderAppPayload({ status: 'REJECTED', currentStageIndex: 2, jobStages })) });
    });

    await page.goto('/dashboard', { waitUntil: 'networkidle' });

    await page.getByTestId('application-card').first().click();
    await expect(page.getByTestId('timeline-drawer')).toBeVisible();

    await expect(page.getByText('TBD')).toBeVisible();
    await assertStagesInOrder(page, 'Rejected');
    await page.screenshot({ path: `${TIMELINE_DIR}/edge_case.png`, fullPage: true });
  });

  test('invalid_case (empty job.stages shows Timeline not available only in drawer)', async ({ page }) => {
    await loginAsStudent(page);

    await page.route('**/api/applications', async (route) => {
      return route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(renderAppPayload({ status: 'APPLIED', currentStageIndex: 0, jobStages: [] })) });
    });

    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    await expect(page.getByTestId('timeline-drawer')).toHaveCount(0);
    await expect(page.getByText('Timeline not available')).toHaveCount(0);

    await page.getByTestId('application-card').first().click();
    await expect(page.getByTestId('timeline-drawer')).toBeVisible();
    await expect(page.getByText('Timeline not available')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: `${TIMELINE_DIR}/invalid_case.png`, fullPage: true });
  });
});

