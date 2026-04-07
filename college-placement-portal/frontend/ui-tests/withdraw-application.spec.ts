import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const API_BASE = 'http://localhost:5001/api';
const STUDENT_EMAIL = 'ui_student@example.com';
const PASSWORD = 'Password@123';

const ROOT = 'verification_screenshots/withdraw_feature';
const APPLY_FLOW_DIR = `${ROOT}/apply_flow`;
const WITHDRAW_SUCCESS_DIR = `${ROOT}/withdraw_success`;
const DEADLINE_BLOCK_DIR = `${ROOT}/deadline_block`;
const EDGE_DIR = `${ROOT}/edge_cases`;

test.beforeAll(() => {
  [APPLY_FLOW_DIR, WITHDRAW_SUCCESS_DIR, DEADLINE_BLOCK_DIR, EDGE_DIR].forEach((d) => fs.mkdirSync(d, { recursive: true }));
});

async function login(page: import('@playwright/test').Page) {
  await page.request.get(`${API_BASE}/seed/seed-ui`);
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').fill(STUDENT_EMAIL);
  await page.getByPlaceholder('Enter your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
}

function mockCommon(page: import('@playwright/test').Page) {
  page.route('**/api/student/profile', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ success: true, data: { isLocked: false } }) })
  );
  page.route('**/api/student/resumes', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ success: true, data: [{ id: 'resume-1', fileName: 'Resume.pdf' }] }) })
  );
  page.route('**/api/companies/lookup?name=*', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        found: true,
        rating: 4.2,
        reviews: 1000,
        logoUrl: null,
        highlyRatedFor: [],
        criticallyRatedFor: []
      })
    })
  );
}

test('withdraw before deadline enables apply again', async ({ page }) => {
  await login(page);
  mockCommon(page);

  let status = 'APPLIED';
  const jobId = 'job-future-1';

  page.route('**/api/jobs', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        success: true,
        jobs: [{
          id: jobId,
          role: 'Future Withdraw Role',
          companyName: 'WithdrawCorp',
          description: 'Role for withdraw flow',
          jobType: 'Full-Time',
          ctc: '10',
          cgpaMin: 6,
          eligibleBranches: '["CSE"]',
          requiredProfileFields: '["resume"]',
          customQuestions: '[]',
          applicationDeadline: '2030-01-01T00:00:00.000Z',
          status: 'PUBLISHED'
        }]
      })
    })
  );

  page.route('**/api/applications', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      const apps = [{
        id: 'app-1',
        jobId,
        resumeId: 'resume-1',
        status,
        appliedAt: new Date().toISOString(),
        applicationData: {},
        job: { role: 'Future Withdraw Role', companyName: 'WithdrawCorp', stages: [] }
      }];
      return route.fulfill({ status: 200, body: JSON.stringify({ success: true, applications: apps }) });
    }
    return route.fallback();
  });

  page.route('**/api/applications/*/withdraw', (route) => {
    status = 'WITHDRAWN';
    return route.fulfill({
      status: 200,
      body: JSON.stringify({ success: true, message: 'Application withdrawn successfully', application: { id: 'app-1', status: 'WITHDRAWN' } })
    });
  });

  await page.goto('/job-board', { waitUntil: 'networkidle' });
  const card = page.locator('[data-testid="job-card"]').filter({ hasText: 'Future Withdraw Role' }).first();
  await expect(card.getByRole('button', { name: /Withdraw Application/i })).toBeVisible();
  await page.screenshot({ path: `${APPLY_FLOW_DIR}/applied_state.png`, fullPage: true });

  await card.getByRole('button', { name: /Withdraw Application/i }).click();
  await expect(page.getByText(/Application withdrawn successfully/i)).toBeVisible();
  await expect(card.getByRole('button', { name: /Apply Now/i })).toBeVisible();
  await page.screenshot({ path: `${WITHDRAW_SUCCESS_DIR}/withdraw_success.png`, fullPage: true });
});

test('withdraw option blocked after deadline', async ({ page }) => {
  await login(page);
  mockCommon(page);

  page.route('**/api/jobs', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        success: true,
        jobs: [{
          id: 'job-past-1',
          role: 'Past Deadline Role',
          companyName: 'DeadlineCorp',
          description: 'Past deadline role',
          jobType: 'Full-Time',
          ctc: '8',
          cgpaMin: 6,
          eligibleBranches: '["CSE"]',
          requiredProfileFields: '["resume"]',
          customQuestions: '[]',
          applicationDeadline: '2020-01-01T00:00:00.000Z',
          status: 'PUBLISHED'
        }]
      })
    })
  );
  page.route('**/api/applications', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        success: true,
        applications: [{
          id: 'app-past-1',
          jobId: 'job-past-1',
          resumeId: 'resume-1',
          status: 'APPLIED',
          appliedAt: new Date().toISOString(),
          applicationData: {},
          job: { role: 'Past Deadline Role', companyName: 'DeadlineCorp', stages: [] }
        }]
      })
    })
  );

  await page.goto('/job-board', { waitUntil: 'networkidle' });
  const card = page.locator('[data-testid="job-card"]').filter({ hasText: 'Past Deadline Role' }).first();
  await expect(card.getByText(/^Applied$/)).toBeVisible();
  await expect(card.getByRole('button', { name: /Withdraw Application/i })).toHaveCount(0);
  await page.screenshot({ path: `${DEADLINE_BLOCK_DIR}/deadline_blocked.png`, fullPage: true });
});

test('withdraw API failure shows error state', async ({ page }) => {
  await login(page);
  mockCommon(page);

  page.route('**/api/jobs', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        success: true,
        jobs: [{
          id: 'job-err-1',
          role: 'Error Withdraw Role',
          companyName: 'ErrorCorp',
          description: 'Error role',
          jobType: 'Full-Time',
          ctc: '8',
          cgpaMin: 6,
          eligibleBranches: '["CSE"]',
          requiredProfileFields: '["resume"]',
          customQuestions: '[]',
          applicationDeadline: '2030-01-01T00:00:00.000Z',
          status: 'PUBLISHED'
        }]
      })
    })
  );
  page.route('**/api/applications', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        success: true,
        applications: [{
          id: 'app-err-1',
          jobId: 'job-err-1',
          resumeId: 'resume-1',
          status: 'APPLIED',
          appliedAt: new Date().toISOString(),
          applicationData: {},
          job: { role: 'Error Withdraw Role', companyName: 'ErrorCorp', stages: [] }
        }]
      })
    })
  );
  page.route('**/api/applications/*/withdraw', (route) =>
    route.fulfill({ status: 404, body: JSON.stringify({ success: false, message: 'Application not found' }) })
  );

  await page.goto('/job-board', { waitUntil: 'networkidle' });
  const card = page.locator('[data-testid="job-card"]').filter({ hasText: 'Error Withdraw Role' }).first();
  await card.getByRole('button', { name: /Withdraw Application/i }).click();
  await expect(page.getByText(/Application not found/i)).toBeVisible();
  await page.screenshot({ path: `${EDGE_DIR}/withdraw_error.png`, fullPage: true });
});
