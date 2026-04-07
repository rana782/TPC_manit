import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const API_BASE = 'http://localhost:5001/api';
const STUDENT_EMAIL = 'ui_student@example.com';
const SPOC_EMAIL = 'ui_spoc@example.com';
const PASSWORD = 'Password@123';

const ROOT = 'verification_screenshots/withdraw_feature';
const REAPPLY_DIR = `${ROOT}/reapply`;
const SPOC_VIEW_DIR = `${ROOT}/spoc_view`;
const EDGE_DIR = `${ROOT}/edge_cases`;

test.beforeAll(() => {
  [REAPPLY_DIR, SPOC_VIEW_DIR, EDGE_DIR].forEach((d) => fs.mkdirSync(d, { recursive: true }));
});

async function login(page: import('@playwright/test').Page, email: string) {
  await page.request.get(`${API_BASE}/seed/seed-ui`);
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('Enter your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

function mockStudentCommon(page: import('@playwright/test').Page) {
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
        rating: 4.0,
        reviews: 1000,
        logoUrl: null,
        highlyRatedFor: [],
        criticallyRatedFor: []
      })
    })
  );
  page.route('**/api/ats/score', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        success: true,
        data: {
          resumeId: 'resume-1',
          jobId: 'job-reapply-1',
          score: 74,
          matchScore: 74,
          semanticScore: 71,
          skillScore: 78,
          explanation: 'Good match',
          matchedKeywords: ['node'],
          skillsMatched: ['node', 'express'],
          skillsMissing: ['aws'],
          suggestions: ['Add AWS deployment project']
        }
      })
    })
  );
}

test('withdraw then reapply uses same record and no duplicate error', async ({ page }) => {
  await login(page, STUDENT_EMAIL);
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
  mockStudentCommon(page);

  const jobId = 'job-reapply-1';
  let currentStatus: 'APPLIED' | 'WITHDRAWN' = 'APPLIED';
  let applyPostCalls = 0;
  const appId = 'app-reapply-1';

  page.route('**/api/jobs', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        success: true,
        jobs: [{
          id: jobId,
          role: 'Reapply Engineer',
          companyName: 'ReapplyCorp',
          description: 'Need Node and Express',
          jobType: 'Full-Time',
          ctc: '12',
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
      return route.fulfill({
        status: 200,
        body: JSON.stringify({
          success: true,
          applications: [{
            id: appId,
            jobId,
            resumeId: 'resume-1',
            status: currentStatus,
            appliedAt: new Date().toISOString(),
            applicationData: {},
            job: { role: 'Reapply Engineer', companyName: 'ReapplyCorp', stages: [] }
          }]
        })
      });
    }
    if (method === 'POST') {
      applyPostCalls += 1;
      currentStatus = 'APPLIED';
      return route.fulfill({
        status: 201,
        body: JSON.stringify({
          success: true,
          message: 'Successfully reapplied to job!',
          application: { id: appId, jobId, status: 'APPLIED', atsScore: 0 },
          atsScore: 0,
          matchScore: 0,
          semanticScore: 0,
          skillScore: 0
        })
      });
    }
    return route.fallback();
  });

  page.route('**/api/applications/*/withdraw', (route) => {
    currentStatus = 'WITHDRAWN';
    return route.fulfill({ status: 200, body: JSON.stringify({ success: true, message: 'Application withdrawn successfully' }) });
  });

  await page.goto('/job-board', { waitUntil: 'networkidle' });
  const card = page.locator('[data-testid="job-card"]').filter({ hasText: 'Reapply Engineer' }).first();

  await card.getByRole('button', { name: /Withdraw Application/i }).click();
  await expect(card.getByRole('button', { name: /Apply Now/i })).toBeVisible();

  await card.getByRole('button', { name: /Apply Now/i }).click();
  await page.locator('label:has(input[name="resume"])').first().click();
  await page.getByTestId('apply-ats-match-button').click();
  await expect(page.getByTestId('apply-ats-inline')).toContainText('/100', { timeout: 15000 });
  await page.getByRole('button', { name: /next/i }).first().click();
  await page.getByRole('button', { name: /next/i }).first().click();
  await page.getByRole('button', { name: /submit application/i }).click();

  await expect(page.getByText(/Successfully reapplied|Successfully applied/i)).toBeVisible();
  await expect(card.getByRole('button', { name: /Withdraw Application/i })).toBeVisible();
  expect(applyPostCalls).toBe(1);
  await page.screenshot({ path: `${REAPPLY_DIR}/withdraw_then_reapply.png`, fullPage: true });
});

test('double-withdraw edge case is handled', async ({ page }) => {
  await login(page, STUDENT_EMAIL);
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
  mockStudentCommon(page);

  page.route('**/api/jobs', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        success: true,
        jobs: [{
          id: 'job-double-1',
          role: 'Double Withdraw Role',
          companyName: 'EdgeCorp',
          description: 'Edge case role',
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
  page.route('**/api/applications', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        success: true,
        applications: [{
          id: 'app-double-1',
          jobId: 'job-double-1',
          status: 'APPLIED',
          resumeId: 'resume-1',
          appliedAt: new Date().toISOString(),
          applicationData: {},
          job: { role: 'Double Withdraw Role', companyName: 'EdgeCorp', stages: [] }
        }]
      })
    })
  );
  page.route('**/api/applications/*/withdraw', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ success: true, message: 'Application already withdrawn' }) })
  );

  await page.goto('/job-board', { waitUntil: 'networkidle' });
  const card = page.locator('[data-testid="job-card"]').filter({ hasText: 'Double Withdraw Role' }).first();
  await card.getByRole('button', { name: /Withdraw Application/i }).click();
  await expect(page.getByText(/withdrawn/i)).toBeVisible();
  await page.screenshot({ path: `${EDGE_DIR}/double_withdraw.png`, fullPage: true });
});

test('spoc active list hides withdrawn applicant', async ({ page }) => {
  await login(page, SPOC_EMAIL);
  await expect(page).toHaveURL(/\/jobs-management/, { timeout: 15000 });

  page.route('**/api/jobs', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        success: true,
        jobs: [{
          id: 'job-spoc-1',
          role: 'SPOC Visibility Role',
          companyName: 'SpocCorp',
          status: 'PUBLISHED',
          applications: [{ id: 'active-app' }],
          stages: []
        }]
      })
    })
  );
  page.route('**/api/jobs/job-spoc-1', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        success: true,
        job: {
          id: 'job-spoc-1',
          role: 'SPOC Visibility Role',
          companyName: 'SpocCorp',
          status: 'PUBLISHED',
          stages: [],
          applications: [{
            id: 'active-app',
            status: 'APPLIED',
            atsScore: 75,
            student: { id: 's1', firstName: 'Active', lastName: 'Student', scholarNo: '1001' }
          }]
        }
      })
    })
  );

  await page.goto('/jobs-management/job-spoc-1', { waitUntil: 'networkidle' });
  await expect(page).toHaveURL(/\/jobs-management\/job-spoc-1/);
  await expect(page.getByText(/Withdrawn Student/i)).toHaveCount(0);
  await page.screenshot({ path: `${SPOC_VIEW_DIR}/withdrawn_hidden_in_spoc_list.png`, fullPage: true });
});
