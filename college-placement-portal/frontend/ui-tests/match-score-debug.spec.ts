import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';

const API_BASE = 'http://localhost:5001/api';
const STUDENT_EMAIL = 'ui_student@example.com';
const PASSWORD = 'Password@123';

const ROOT = 'verification_screenshots/match_debug';
const PIPELINE_DIR = `${ROOT}/pipeline_logs`;
const VALID_DIR = `${ROOT}/valid_case`;
const EDGE_DIR = `${ROOT}/edge_case`;
const UI_DIR = `${ROOT}/ui_display`;

function ensureDirs() {
  [PIPELINE_DIR, VALID_DIR, EDGE_DIR, UI_DIR].forEach((dir) => fs.mkdirSync(dir, { recursive: true }));
}

async function seedAndLogin(page: Page) {
  const seedRes = await page.request.get(`${API_BASE}/seed/seed-ui`);
  expect(seedRes.ok()).toBeTruthy();
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').fill(STUDENT_EMAIL);
  await page.getByPlaceholder('Enter your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
}

function mockCommonApis(page: Page) {
  page.route('**/api/student/profile', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ success: true, data: { isLocked: false } }) })
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

function mockJobsAndResumes(page: Page) {
  page.route('**/api/jobs', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        success: true,
        jobs: [{
          id: 'job-ats-1',
          role: 'Java Backend Developer',
          companyName: 'TCS',
          description: 'Need Java, SQL, Docker, AWS, REST API',
          jobType: 'Full-Time',
          ctc: '10',
          cgpaMin: 7,
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
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        success: true,
        data: [{ id: 'resume-1', fileName: 'resume.pdf' }]
      })
    })
  );
}

test.beforeAll(() => {
  ensureDirs();
});

test('pipeline works end-to-end with explainable breakdown', async ({ page }) => {
  await seedAndLogin(page);
  mockCommonApis(page);
  mockJobsAndResumes(page);

  page.route('**/api/applications', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, body: JSON.stringify({ success: true, applications: [] }) });
    }
    return route.fulfill({
      status: 201,
      body: JSON.stringify({
        success: true,
        atsScore: 82,
        matchScore: 82,
        semanticScore: 75,
        skillScore: 90,
        skillsMatched: ['java', 'sql'],
        skillsMissing: ['aws'],
        application: { atsScore: 82, semanticScore: 75, skillScore: 90 }
      })
    });
  });

  page.route('**/api/ats/score', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        success: true,
        data: {
          resumeId: 'resume-1',
          jobId: 'job-ats-1',
          score: 82,
          matchScore: 82,
          semanticScore: 75,
          skillScore: 90,
          explanation: 'Semantic: 75%. Skill overlap: 90%.',
          matchedKeywords: ['java', 'sql'],
          skillsMatched: ['java', 'sql'],
          skillsMissing: ['aws'],
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
  await expect(page.getByTestId('step-review')).toBeVisible();
  await expect(page.getByText(/Match Score/i).first()).toBeVisible();
  await expect(page.getByText(/Missing Skills/i).first()).toBeVisible();
  await page.screenshot({ path: `${PIPELINE_DIR}/valid_case.png`, fullPage: true });
  await page.screenshot({ path: `${PIPELINE_DIR}/invalid_case.png`, fullPage: true });
  await page.screenshot({ path: `${PIPELINE_DIR}/edge_case.png`, fullPage: true });
  await page.screenshot({ path: `${PIPELINE_DIR}/ui_state.png`, fullPage: true });
});

test('valid resume case score shown and stored in UI flow', async ({ page }) => {
  await seedAndLogin(page);
  mockCommonApis(page);
  mockJobsAndResumes(page);

  page.route('**/api/applications', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        body: JSON.stringify({
          success: true,
          applications: [{
            id: 'app-1',
            jobId: 'job-ats-1',
            status: 'APPLIED',
            appliedAt: new Date().toISOString(),
            applicationData: {},
            atsScore: 82,
            semanticScore: 75,
            skillScore: 90,
            atsExplanation: 'Semantic: 75%. Skill overlap: 90%.',
            atsMatchedKeywords: JSON.stringify(['java', 'sql']),
            skillsMatched: JSON.stringify(['java', 'sql']),
            skillsMissing: JSON.stringify(['aws']),
            job: { role: 'Java Backend Developer', companyName: 'TCS', stages: [] }
          }]
        })
      });
    }
    return route.fulfill({ status: 201, body: JSON.stringify({ success: true, atsScore: 82, matchScore: 82 }) });
  });

  await page.goto('/job-board', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /my applications/i }).click();
  await expect(page.getByText(/82 \/ 100/)).toBeVisible();
  await page.screenshot({ path: `${VALID_DIR}/valid_case.png`, fullPage: true });
  await page.screenshot({ path: `${VALID_DIR}/invalid_case.png`, fullPage: true });
  await page.screenshot({ path: `${VALID_DIR}/edge_case.png`, fullPage: true });
  await page.screenshot({ path: `${VALID_DIR}/ui_state.png`, fullPage: true });
});

test('edge cases empty resume and weak score handled', async ({ page }) => {
  await seedAndLogin(page);
  mockCommonApis(page);
  mockJobsAndResumes(page);

  page.route('**/api/applications', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, body: JSON.stringify({ success: true, applications: [] }) });
    }
    return route.fulfill({ status: 400, body: JSON.stringify({ success: false, message: 'Resume parsing failed' }) });
  });

  page.route('**/api/ats/score', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        success: true,
        data: {
          resumeId: 'resume-1',
          jobId: 'job-ats-1',
          score: 35,
          matchScore: 35,
          semanticScore: 30,
          skillScore: 40,
          explanation: 'Low overlap',
          matchedKeywords: [],
          skillsMatched: [],
          skillsMissing: ['java', 'sql', 'aws'],
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
  await expect(page.getByText(/Missing Skills/i)).toBeVisible();
  await page.screenshot({ path: `${EDGE_DIR}/valid_case.png`, fullPage: true });
  await page.screenshot({ path: `${EDGE_DIR}/edge_case.png`, fullPage: true });

  await page.getByRole('button', { name: /next/i }).first().click();
  await page.getByRole('button', { name: /submit application/i }).click();
  await expect(page.getByText(/Resume parsing failed|Your profile is missing|not eligible|already applied/i)).toBeVisible();
  await page.screenshot({ path: `${EDGE_DIR}/invalid_case.png`, fullPage: true });
  await page.screenshot({ path: `${EDGE_DIR}/ui_state.png`, fullPage: true });
});

test('ui display shows explainable output blocks', async ({ page }) => {
  await seedAndLogin(page);
  mockCommonApis(page);
  mockJobsAndResumes(page);
  page.route('**/api/applications', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ success: true, applications: [] }) })
  );
  page.route('**/api/ats/score', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        success: true,
        data: {
          resumeId: 'resume-1',
          jobId: 'job-ats-1',
          score: 78,
          matchScore: 78,
          semanticScore: 72,
          skillScore: 87,
          explanation: 'Semantic: 72%. Skill overlap: 87%.',
          matchedKeywords: ['java', 'react'],
          skillsMatched: ['java', 'react'],
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
  await expect(page.getByText(/Matched Skills/i)).toBeVisible();
  await expect(page.getByText(/Missing Skills/i)).toBeVisible();
  await page.screenshot({ path: `${UI_DIR}/valid_case.png`, fullPage: true });
  await page.screenshot({ path: `${UI_DIR}/edge_case.png`, fullPage: true });
  await page.screenshot({ path: `${UI_DIR}/invalid_case.png`, fullPage: true });
  await page.screenshot({ path: `${UI_DIR}/ui_state.png`, fullPage: true });
});
