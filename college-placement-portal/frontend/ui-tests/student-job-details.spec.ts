import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const STUDENT_EMAIL = 'ui_student@example.com';
const STUDENT_PASSWORD = 'Password@123';

const API_BASE = 'http://localhost:5001/api';

const JOB_DETAILS_DIR = 'verification_screenshots/student_module/job_board_view_details';
const APPLICANTS_DIR = 'verification_screenshots/student_module/applicant_count';

test.beforeAll(() => {
  fs.mkdirSync(JOB_DETAILS_DIR, { recursive: true });
  fs.mkdirSync(APPLICANTS_DIR, { recursive: true });
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

async function mockJobBoardBaseApis(page: import('@playwright/test').Page) {
  const publishedJob = {
    id: 'job_1',
    role: 'Frontend Developer',
    companyName: 'InnovateTech',
    description: 'Looking for a frontend engineer experienced in React + TypeScript.',
    jobType: 'Full-Time',
    ctc: '12',
    cgpaMin: 7,
    eligibleBranches: ['CSE', 'ECE'],
    requiredProfileFields: ['resume', 'cgpa', 'linkedin'],
    customQuestions: [],
    applicationDeadline: '2030-01-01T00:00:00.000Z',
    status: 'PUBLISHED',
  };

  await page.route('**/api/jobs', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ success: true, jobs: [publishedJob] }),
    })
  );

  await page.route('**/api/applications', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ success: true, applications: [] }),
    })
  );

  await page.route('**/api/student/profile', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        success: true,
        data: { isLocked: false, lockedReason: '' },
      }),
    })
  );

  await page.route('**/api/student/resumes', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ success: true, data: [] }),
    })
  );
}

test.describe('Student Job Board -> View Details (read-only)', () => {
  test('valid_case (no Apply option + applicant count visible)', async ({ page }) => {
    await loginAsStudent(page);
    await mockJobBoardBaseApis(page);

    const payload = {
      success: true,
      applicantsCount: 42,
      job: {
        id: 'job_1',
        role: 'Frontend Developer',
        companyName: 'InnovateTech',
        description: 'Looking for a frontend engineer experienced in React + TypeScript.',
        jobType: 'Full-Time',
        ctc: '12',
        cgpaMin: 7,
        eligibleBranches: ['CSE', 'ECE'],
        requiredProfileFields: ['resume', 'cgpa', 'linkedin'],
        customQuestions: [],
        applicationDeadline: '2030-01-01T00:00:00.000Z',
        location: null,
        stages: [
          { id: 'st1', name: 'Online Assessment', scheduledDate: '2030-02-01T00:00:00.000Z', status: 'PENDING' },
          { id: 'st2', name: 'Technical Interview', scheduledDate: '2030-02-10T00:00:00.000Z', status: 'PENDING' },
        ],
      },
    };

    await page.route('**/api/jobs/student/*/details', (route) => {
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
    });

    await page.goto('/job-board', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /view details/i }).first().click();

    const modal = page.getByTestId('job-details-modal');
    await expect(modal).toBeVisible({ timeout: 10000 });

    await expect(modal.getByText(/Applied by/)).toContainText('42');
    await expect(modal.getByRole('button', { name: /apply now/i })).toHaveCount(0);
    await expect(modal.getByText(/submit application/i)).toHaveCount(0);

    await page.screenshot({ path: `${JOB_DETAILS_DIR}/valid_case.png` });
    await page.screenshot({ path: `${APPLICANTS_DIR}/valid_case.png` });
    await page.screenshot({ path: `${JOB_DETAILS_DIR}/ui_state.png` });
    await page.screenshot({ path: `${APPLICANTS_DIR}/ui_state.png` });
  });

  test('invalid_case (endpoint error shown below modal content block)', async ({ page }) => {
    await loginAsStudent(page);
    await mockJobBoardBaseApis(page);

    await page.route('**/api/jobs/student/*/details', (route) => {
      return route.fulfill({
        status: 404,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ success: false, message: 'Job not found' }),
      });
    });

    await page.goto('/job-board', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /view details/i }).first().click();

    const modal = page.getByTestId('job-details-modal');
    await expect(modal).toBeVisible({ timeout: 10000 });
    const err = page.getByTestId('job-details-error');
    await expect(err).toBeVisible({ timeout: 10000 });
    await expect(err).toContainText('Job not found');

    await page.screenshot({ path: `${JOB_DETAILS_DIR}/invalid_case.png` });
    await page.screenshot({ path: `${APPLICANTS_DIR}/invalid_case.png` });
  });

  test('edge_case (0 applicants + missing optional fields)', async ({ page }) => {
    await loginAsStudent(page);
    await mockJobBoardBaseApis(page);

    const payload = {
      success: true,
      applicantsCount: 0,
      job: {
        id: 'job_1',
        role: 'Junior Developer',
        companyName: 'Acme Corp',
        description: '',
        jobType: 'Full-Time',
        ctc: null,
        cgpaMin: 0,
        eligibleBranches: [],
        requiredProfileFields: [],
        customQuestions: [],
        applicationDeadline: '2030-01-01T00:00:00.000Z',
        location: null,
        stages: [],
      },
    };

    await page.route('**/api/jobs/student/*/details', (route) => {
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
    });

    await page.goto('/job-board', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /view details/i }).first().click();

    const modal = page.getByTestId('job-details-modal');
    await expect(modal).toBeVisible({ timeout: 10000 });

    await expect(modal.getByText(/Applied by/)).toContainText('0');
    await expect(modal.getByText('Timeline not available')).toBeVisible();

    await page.screenshot({ path: `${JOB_DETAILS_DIR}/edge_case.png` });
    await page.screenshot({ path: `${APPLICANTS_DIR}/edge_case.png` });
  });
});

