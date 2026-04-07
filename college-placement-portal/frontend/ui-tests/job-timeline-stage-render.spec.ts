import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const ROOT = 'verification_screenshots/dynamic_timeline_stages/job_2_custom_timeline';

test.beforeAll(() => {
  fs.mkdirSync(ROOT, { recursive: true });
});

async function loginSpoc(page: import('@playwright/test').Page) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').fill('spoc@example.com');
  await page.getByPlaceholder('Enter your password').fill('Pass@123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/jobs-management|\/dashboard/, { timeout: 20000 });
}

test('different job returns different stage column titles', async ({ page }) => {
  const jobB = '33333333-3333-4333-8333-333333333333';

  await page.route(`**/api/jobs/${jobB}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        job: {
          id: jobB,
          role: 'Other',
          companyName: 'Other Co',
          status: 'PUBLISHED',
          applicationDeadline: '2030-12-31T00:00:00.000Z',
          stages: [
            { id: 'x1', name: 'Resume Shortlist', scheduledDate: '2030-02-01T00:00:00.000Z', status: '' },
            { id: 'x2', name: 'Manager Round', scheduledDate: '2030-04-01T00:00:00.000Z', status: '' },
          ],
          timelineStages: [
            { id: 'x1', name: 'Resume Shortlist', order: 1 },
            { id: 'x2', name: 'Manager Round', order: 2 },
          ],
          applications: [
            {
              id: 'app-x1',
              currentStageIndex: 0,
              currentStageId: 'x1',
              currentStageName: 'Resume Shortlist',
              status: 'APPLIED',
              atsScore: 50,
              semanticScore: 50,
              skillScore: 50,
              applicationData: {},
              extraAnswers: {},
              student: { id: 'sx1', firstName: 'Ada', lastName: 'One', scholarNo: 'S-X1', isLocked: false },
            },
            {
              id: 'app-x2',
              currentStageIndex: 1,
              currentStageId: 'x2',
              currentStageName: 'Manager Round',
              status: 'SHORTLISTED',
              atsScore: 60,
              semanticScore: 55,
              skillScore: 58,
              applicationData: {},
              extraAnswers: {},
              student: { id: 'sx2', firstName: 'Bob', lastName: 'Two', scholarNo: 'S-X2', isLocked: false },
            },
          ],
        },
      }),
    })
  );

  await loginSpoc(page);
  await page.goto(`/jobs/${jobB}/details`, { waitUntil: 'networkidle' });

  await expect(page.getByTestId('timeline-stage-title').filter({ hasText: 'Resume Shortlist' })).toBeVisible();
  await expect(page.getByTestId('timeline-stage-title').filter({ hasText: 'Manager Round' })).toBeVisible();
  await expect(page.getByText('OnlyStageOne')).toHaveCount(0);

  await page.screenshot({ path: `${ROOT}/valid_case.png`, fullPage: true });
  await page.screenshot({ path: `${ROOT}/ui_state.png`, fullPage: true });
  await page.screenshot({ path: `${ROOT}/edge_case.png`, fullPage: true });
  await page.screenshot({ path: `${ROOT}/invalid_case.png`, fullPage: true });
});

test('empty applicants: columns still render from timeline', async ({ page }) => {
  const jobId = '44444444-4444-4444-8444-444444444444';
  await page.route(`**/api/jobs/${jobId}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        job: {
          id: jobId,
          role: 'R',
          companyName: 'Empty Co',
          status: 'PUBLISHED',
          applicationDeadline: '2030-12-31T00:00:00.000Z',
          stages: [{ id: 's1', name: 'Solo Stage', scheduledDate: '2030-02-01T00:00:00.000Z', status: '' }],
          timelineStages: [{ id: 's1', name: 'Solo Stage', order: 1 }],
          applications: [],
        },
      }),
    })
  );

  await loginSpoc(page);
  await page.goto(`/jobs/${jobId}/details`, { waitUntil: 'networkidle' });
  await expect(page.getByTestId('applicants-kanban')).toBeVisible();
  await expect(page.getByText('No applicants yet')).toBeVisible();
  const emptyRoot = 'verification_screenshots/dynamic_timeline_stages/empty_stage';
  await page.screenshot({ path: `${emptyRoot}/edge_case.png`, fullPage: true });
  await page.screenshot({ path: `${emptyRoot}/valid_case.png`, fullPage: true });
  await page.screenshot({ path: `${emptyRoot}/invalid_case.png`, fullPage: true });
  await page.screenshot({ path: `${emptyRoot}/ui_state.png`, fullPage: true });
});
