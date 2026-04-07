import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const API_BASE = 'http://localhost:5001/api';
const STUDENT_EMAIL = 'ui_student@example.com';
const SPOC_EMAIL = 'ui_spoc@example.com';
const PASSWORD = 'Password@123';

const ROOT = 'verification_screenshots/ats_analysis';
const SUCCESS_DIR = `${ROOT}/valid_case`;
const ATS_FAIL_DIR = `${ROOT}/fallback_case`;
const EDGE_DIR = `${ROOT}/edge_cases`;
const SPOC_DIR = `${ROOT}/spoc_view`;

test.beforeAll(() => {
  [SUCCESS_DIR, ATS_FAIL_DIR, EDGE_DIR, SPOC_DIR].forEach((d) => fs.mkdirSync(d, { recursive: true }));
});

async function login(page: import('@playwright/test').Page, email: string) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('Enter your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

function mockStudentBase(page: import('@playwright/test').Page) {
  page.route('**/api/student/profile', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ success: true, data: { isLocked: false } }) })
  );
  page.route('**/api/companies/lookup?name=*', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        found: true,
        rating: 4.1,
        reviews: 1000,
        logoUrl: null,
        highlyRatedFor: [],
        criticallyRatedFor: []
      })
    })
  );
  page.route('**/api/jobs', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        success: true,
        jobs: [{
          id: 'job-1',
          role: 'Apply Flow Engineer',
          companyName: 'TCS',
          description: 'Need Java SQL Docker',
          jobType: 'Full-Time',
          ctc: '12',
          cgpaMin: 6.5,
          eligibleBranches: '["CSE"]',
          requiredProfileFields: '["resume"]',
          customQuestions: '[]',
          applicationDeadline: '2030-01-01T00:00:00.000Z',
          status: 'PUBLISHED'
        }]
      })
    })
  );
  page.route('**/api/student/resumes', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ success: true, data: [{ id: 'resume-1', fileName: 'resume.pdf' }] }) })
  );
}

test('normal apply succeeds with score', async ({ page }) => {
  await page.request.get(`${API_BASE}/seed/seed-ui`);
  await login(page, STUDENT_EMAIL);
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
  mockStudentBase(page);

  page.route('**/api/applications', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, body: JSON.stringify({ success: true, applications: [] }) });
    }
    return route.fulfill({ status: 201, body: JSON.stringify({ success: true, atsScore: 78, matchScore: 78, semanticScore: 74, skillScore: 84, application: { atsScore: 78 } }) });
  });
  page.route('**/api/ats/score', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        success: true,
        data: {
          resumeId: 'resume-1',
          jobId: 'job-1',
          score: 78,
          matchScore: 78,
          semanticScore: 74,
          skillScore: 84,
          explanation: 'good',
          matchedKeywords: ['java'],
          skillsMatched: ['java'],
          skillsMissing: ['docker'],
          suggestions: []
        }
      })
    })
  );

  await page.goto('/job-board', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /apply now/i }).first().click();
  await page.locator('label:has(input[name="resume"])').first().click();
  await page.getByTestId('apply-ats-match-button').click();
  await expect(page.getByTestId('apply-ats-inline')).toContainText('/100', { timeout: 15000 });
  await page.getByRole('button', { name: /next/i }).first().click();
  await page.getByRole('button', { name: /submit application/i }).click();
  await expect(page.getByText(/Successfully applied!/i)).toBeVisible();
  await expect(page.getByText(/Match score: 78/i)).toBeVisible();
  await page.screenshot({ path: `${SUCCESS_DIR}/valid_case.png`, fullPage: true });
});

test('ATS score failure blocks wizard until match succeeds', async ({ page }) => {
  await page.request.get(`${API_BASE}/seed/seed-ui`);
  await login(page, STUDENT_EMAIL);
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
  mockStudentBase(page);

  page.route('**/api/applications', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, body: JSON.stringify({ success: true, applications: [] }) });
    }
    return route.fulfill({ status: 201, body: JSON.stringify({ success: true, atsScore: 0, matchScore: 0, semanticScore: 0, skillScore: 0, application: { atsScore: 0 } }) });
  });
  page.route('**/api/ats/score', (route) =>
    route.fulfill({ status: 500, body: JSON.stringify({ success: false, message: 'ATS service down' }) })
  );

  await page.goto('/job-board', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /apply now/i }).first().click();
  await page.locator('label:has(input[name="resume"])').first().click();
  await expect(page.getByRole('button', { name: /next/i }).first()).toBeEnabled();
  await page.getByTestId('apply-ats-match-button').click();
  await expect(page.getByText(/ATS service down/i)).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: /next/i }).first()).toBeEnabled();
  await page.screenshot({ path: `${ATS_FAIL_DIR}/fallback_case.png`, fullPage: true });
});

test('edge case weak resume still allows apply with score 0', async ({ page }) => {
  await page.request.get(`${API_BASE}/seed/seed-ui`);
  await login(page, STUDENT_EMAIL);
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
  mockStudentBase(page);

  page.route('**/api/applications', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, body: JSON.stringify({ success: true, applications: [] }) });
    }
    return route.fulfill({ status: 201, body: JSON.stringify({ success: true, atsScore: 0, matchScore: 0, semanticScore: 0, skillScore: 0, application: { atsScore: 0 } }) });
  });
  page.route('**/api/ats/score', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        success: true,
        data: {
          resumeId: 'resume-1',
          jobId: 'job-1',
          score: 0,
          matchScore: 0,
          semanticScore: 0,
          skillScore: 0,
          explanation: 'No score',
          matchedKeywords: [],
          skillsMatched: [],
          skillsMissing: ['java'],
          suggestions: []
        }
      })
    })
  );

  await page.goto('/job-board', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /apply now/i }).first().click();
  await page.locator('label:has(input[name="resume"])').first().click();
  await page.getByTestId('apply-ats-match-button').click();
  await expect(page.getByTestId('apply-ats-inline')).toContainText('/100', { timeout: 15000 });
  await page.getByRole('button', { name: /next/i }).first().click();
  await page.getByRole('button', { name: /submit application/i }).click();
  await expect(page.getByText(/Successfully applied!/i)).toBeVisible();
  await page.screenshot({ path: `${EDGE_DIR}/weak_resume.png`, fullPage: true });
});

test('spoc view is accessible', async ({ page }) => {
  await page.request.get(`${API_BASE}/seed/seed-ui`);
  await login(page, SPOC_EMAIL);
  await expect(page).toHaveURL(/\/jobs-management/, { timeout: 15000 });
  await page.screenshot({ path: `${SPOC_DIR}/job_list.png`, fullPage: true });
});

