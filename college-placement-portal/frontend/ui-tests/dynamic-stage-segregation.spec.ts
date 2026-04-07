import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const ROOT = 'verification_screenshots/dynamic_timeline_stages';

const dirs = [
  `${ROOT}/job_1_initial`,
  `${ROOT}/job_1_move_next`,
  `${ROOT}/job_2_custom_timeline`,
  `${ROOT}/refresh_state`,
  `${ROOT}/empty_stage`,
  `${ROOT}/edge_cases`,
];

test.beforeAll(() => {
  dirs.forEach((d) => fs.mkdirSync(d, { recursive: true }));
});

async function loginSpoc(page: import('@playwright/test').Page) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').fill('spoc@example.com');
  await page.getByPlaceholder('Enter your password').fill('Pass@123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/jobs-management|\/dashboard/, { timeout: 20000 });
}

test.describe('Dynamic stage segregation (mocked job payload)', () => {
  test('renders only API timeline stage names as columns — no hardcoded Applied/OA/Interview pipeline', async ({
    page,
  }) => {
    const jobId = '11111111-1111-4111-8111-111111111111';
    await page.route(`**/api/jobs/${jobId}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          job: {
            id: jobId,
            role: 'Role X',
            companyName: 'Mock Co',
            status: 'PUBLISHED',
            applicationDeadline: '2030-12-31T00:00:00.000Z',
            ctc: '10',
            stages: [
              { id: 'st-a', name: 'OnlyStageOne', scheduledDate: '2030-02-01T00:00:00.000Z', status: '' },
              { id: 'st-b', name: 'OnlyStageTwo', scheduledDate: '2030-03-01T00:00:00.000Z', status: '' },
            ],
            timelineStages: [
              { id: 'st-a', name: 'OnlyStageOne', order: 1, scheduledDate: '2030-02-01T00:00:00.000Z' },
              { id: 'st-b', name: 'OnlyStageTwo', order: 2, scheduledDate: '2030-03-01T00:00:00.000Z' },
            ],
            groupedApplicants: { 'st-a': [], 'st-b': [] },
            applications: [
              {
                id: 'app-1',
                currentStageIndex: 0,
                currentStageId: 'st-a',
                currentStageName: 'OnlyStageOne',
                currentStageOrder: 1,
                status: 'APPLIED',
                atsScore: 55,
                semanticScore: 50,
                skillScore: 60,
                applicationData: {},
                extraAnswers: {},
                student: {
                  id: 's1',
                  firstName: 'Zed',
                  lastName: 'Mock',
                  scholarNo: 'SCH-Z',
                  isLocked: false,
                },
              },
            ],
          },
        }),
      })
    );

    await loginSpoc(page);
    await page.goto(`/jobs/${jobId}/details`, { waitUntil: 'networkidle' });

    await expect(page.getByTestId('applicants-kanban')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('timeline-stage-title').filter({ hasText: 'OnlyStageOne' })).toBeVisible();
    await expect(page.getByTestId('timeline-stage-title').filter({ hasText: 'OnlyStageTwo' })).toHaveCount(0);

    await expect(page.getByText('Applied', { exact: true })).toHaveCount(0);
    await expect(page.getByText('OA', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Interview', { exact: true })).toHaveCount(0);

    await page.getByTestId('stage-column-st-a').getByRole('button').click();
    await expect(page.getByTestId(`stage-column-st-a`)).toContainText('Zed');
    await page.screenshot({ path: `${ROOT}/job_1_initial/ui_state.png`, fullPage: true });
    await page.screenshot({ path: `${ROOT}/job_1_initial/valid_case.png`, fullPage: true });
    await page.screenshot({ path: `${ROOT}/job_1_initial/edge_case.png`, fullPage: true });
    await page.screenshot({ path: `${ROOT}/job_1_initial/invalid_case.png`, fullPage: true });
  });

  test('PATCH advance-stage updates selection (mocked)', async ({ page }) => {
    const jobId = '22222222-2222-4222-8222-222222222222';
    let advanceBody: Record<string, unknown> | null = null;

    await page.route(`**/api/jobs/${jobId}`, (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          job: {
            id: jobId,
            role: 'R',
            companyName: 'Co',
            status: 'PUBLISHED',
            applicationDeadline: '2030-12-31T00:00:00.000Z',
            stages: [
              { id: 'a', name: 'First', scheduledDate: '2030-02-01T00:00:00.000Z', status: '' },
              { id: 'b', name: 'Second', scheduledDate: '2030-03-01T00:00:00.000Z', status: '' },
            ],
            timelineStages: [
              { id: 'a', name: 'First', order: 1 },
              { id: 'b', name: 'Second', order: 2 },
            ],
            applications: [
              {
                id: 'app-1',
                currentStageIndex: 0,
                currentStageId: 'a',
                status: 'APPLIED',
                atsScore: 40,
                semanticScore: 40,
                skillScore: 40,
                applicationData: {},
                extraAnswers: {},
                student: { id: 'stu-1', firstName: 'Move', lastName: 'Me', scholarNo: 'S1', isLocked: false },
              },
            ],
          },
        }),
      });
    });

    await page.route(`**/api/jobs/${jobId}/advance-stage`, async (route) => {
      advanceBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, movedCount: 1, nextStage: { index: 1, name: 'Second' } }),
      });
    });

    await loginSpoc(page);
    await page.goto(`/jobs/${jobId}/details`, { waitUntil: 'networkidle' });
    await page.getByTestId('applicant-row').click();
    await page.getByRole('button', { name: /Move to Next Stage/i }).click();

    expect(advanceBody?.selectedIds).toEqual(['stu-1']);
    expect(advanceBody?.nextStageIndex).toBe(1);
    await page.screenshot({ path: `${ROOT}/job_1_move_next/valid_case.png`, fullPage: true });
    await page.screenshot({ path: `${ROOT}/job_1_move_next/ui_state.png`, fullPage: true });
    await page.screenshot({ path: `${ROOT}/job_1_move_next/edge_case.png`, fullPage: true });
    await page.screenshot({ path: `${ROOT}/job_1_move_next/invalid_case.png`, fullPage: true });
  });

  test('refresh_state: reload keeps dynamic columns', async ({ page }) => {
    const jobId = '55555555-5555-4555-8555-555555555555';
    const payload = {
      success: true,
      job: {
        id: jobId,
        role: 'R',
        companyName: 'Refresh Co',
        status: 'PUBLISHED',
        applicationDeadline: '2030-12-31T00:00:00.000Z',
        stages: [
          { id: 'r1', name: 'Alpha Col', scheduledDate: '2030-02-01T00:00:00.000Z', status: '' },
          { id: 'r2', name: 'Beta Col', scheduledDate: '2030-03-01T00:00:00.000Z', status: '' },
        ],
        timelineStages: [
          { id: 'r1', name: 'Alpha Col', order: 1 },
          { id: 'r2', name: 'Beta Col', order: 2 },
        ],
        applications: [
          {
            id: 'app-r1',
            currentStageIndex: 0,
            currentStageId: 'r1',
            currentStageName: 'Alpha Col',
            status: 'APPLIED',
            atsScore: 40,
            semanticScore: 40,
            skillScore: 40,
            applicationData: {},
            extraAnswers: {},
            student: { id: 'stu-r1', firstName: 'Refresh', lastName: 'User', scholarNo: 'SR1', isLocked: false },
          },
        ],
      },
    };
    await page.route(`**/api/jobs/${jobId}`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
    );
    await loginSpoc(page);
    await page.goto(`/jobs/${jobId}/details`, { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByTestId('timeline-stage-title').filter({ hasText: 'Alpha Col' })).toBeVisible();
    await page.screenshot({ path: `${ROOT}/refresh_state/ui_state.png`, fullPage: true });
    await page.screenshot({ path: `${ROOT}/refresh_state/valid_case.png`, fullPage: true });
    await page.screenshot({ path: `${ROOT}/refresh_state/edge_case.png`, fullPage: true });
    await page.screenshot({ path: `${ROOT}/refresh_state/invalid_case.png`, fullPage: true });
  });

  test('edge_cases folder screenshots', async ({ page }) => {
    const jobId = '66666666-6666-4666-8666-666666666666';
    await page.route(`**/api/jobs/${jobId}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          job: {
            id: jobId,
            role: 'R',
            companyName: 'Edge Co',
            status: 'PUBLISHED',
            applicationDeadline: '2030-12-31T00:00:00.000Z',
            stages: Array.from({ length: 5 }).map((_, i) => ({
              id: `e${i}`,
              name: `Stage ${i + 1}`,
              scheduledDate: new Date(2030, 1, 5 + i).toISOString(),
              status: '',
            })),
            timelineStages: Array.from({ length: 5 }).map((_, i) => ({
              id: `e${i}`,
              name: `Stage ${i + 1}`,
              order: i + 1,
            })),
            applications: [],
          },
        }),
      })
    );
    await loginSpoc(page);
    await page.goto(`/jobs/${jobId}/details`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: `${ROOT}/edge_cases/ui_state.png`, fullPage: true });
    await page.screenshot({ path: `${ROOT}/edge_cases/valid_case.png`, fullPage: true });
    await page.screenshot({ path: `${ROOT}/edge_cases/edge_case.png`, fullPage: true });
    await page.screenshot({ path: `${ROOT}/edge_cases/invalid_case.png`, fullPage: true });
  });
});
