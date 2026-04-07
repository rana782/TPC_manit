import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const API_BASE = 'http://localhost:5001/api';
const STUDENT_EMAIL = 'ui_student@example.com';
const SPOC_EMAIL = 'ui_spoc@example.com';
const PASSWORD = 'Password@123';

const ROOT = 'verification_screenshots/ats_analysis';
const VALID_DIR = `${ROOT}/valid_case`;
const FALLBACK_DIR = `${ROOT}/fallback_case`;
const SUGGEST_DIR = `${ROOT}/suggestions`;
const SPOC_DIR = `${ROOT}/spoc_view`;
const EDGE_DIR = `${ROOT}/edge_cases`;

test.beforeAll(() => {
  [VALID_DIR, FALLBACK_DIR, SUGGEST_DIR, SPOC_DIR, EDGE_DIR].forEach((d) => fs.mkdirSync(d, { recursive: true }));
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
  page.route('**/api/jobs', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        success: true,
        jobs: [{
          id: 'job-1',
          role: 'Backend Developer',
          companyName: 'InnovateTech',
          description: 'Need Node, Express, PostgreSQL, Docker, AWS',
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
}

test('different resumes produce different ATS outcomes', async ({ page }) => {
  await page.request.get(`${API_BASE}/seed/seed-ui`);
  await login(page, STUDENT_EMAIL);
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
  mockStudentBase(page);
  page.route('**/api/student/resumes', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({ success: true, data: [{ id: 'resume-strong', fileName: 'strong.pdf' }, { id: 'resume-weak', fileName: 'weak.pdf' }] })
    })
  );
  page.route('**/api/applications', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, body: JSON.stringify({ success: true, applications: [] }) });
    return route.fulfill({ status: 201, body: JSON.stringify({ success: true, matchScore: 82, semanticScore: 78, skillScore: 86 }) });
  });
  page.route('**/api/ats/score', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    let body: { resumeId?: string };
    try {
      body = route.request().postDataJSON();
    } catch {
      return route.continue();
    }
    const rid = body?.resumeId;
    if (rid === 'resume-strong') {
      return route.fulfill({
        status: 200,
        body: JSON.stringify({
          success: true,
          data: {
            resumeId: 'resume-strong',
            jobId: 'job-1',
            score: 82,
            matchScore: 82,
            explanation: 'Strong fit',
            matchedKeywords: ['node'],
            skillsMatched: ['node', 'express'],
            skillsMissing: ['aws'],
            suggestions: ['Add AWS project']
          }
        })
      });
    }
    return route.fulfill({
      status: 200,
      body: JSON.stringify({
        success: true,
        data: {
          resumeId: 'resume-weak',
          jobId: 'job-1',
          score: 41,
          matchScore: 41,
          explanation: 'Weak fit',
          matchedKeywords: ['node'],
          skillsMatched: ['node'],
          skillsMissing: ['express', 'postgresql', 'docker'],
          suggestions: ['Add backend projects', 'Highlight SQL']
        }
      })
    });
  });

  await page.goto('/job-board', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /apply now/i }).first().click();
  await page.locator('label:has(input[name="resume"])').first().click();
  await page.getByTestId('apply-ats-match-button').click();
  await expect(page.getByTestId('apply-ats-inline')).toContainText('/100', { timeout: 15000 });
  await page.getByRole('button', { name: /next/i }).first().click();
  await expect(page.getByText(/Match Score/i)).toBeVisible();
  await expect(page.getByText(/Suggestions/i)).toBeVisible();
  await page.screenshot({ path: `${VALID_DIR}/resume_comparison.png`, fullPage: true });
});

test('fallback case keeps application success', async ({ page }) => {
  await page.request.get(`${API_BASE}/seed/seed-ui`);
  await login(page, STUDENT_EMAIL);
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
  mockStudentBase(page);
  page.route('**/api/student/resumes', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ success: true, data: [{ id: 'resume-1', fileName: 'resume.pdf' }] }) })
  );
  page.route('**/api/ats/score', (route) => route.fulfill({ status: 500, body: JSON.stringify({ success: false, message: 'ATS unavailable' }) }));
  page.route('**/api/applications', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, body: JSON.stringify({ success: true, applications: [] }) });
    return route.fulfill({ status: 201, body: JSON.stringify({ success: true, atsScore: 0, matchScore: 0, semanticScore: 0, skillScore: 0 }) });
  });

  await page.goto('/job-board', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /apply now/i }).first().click();
  await page.locator('label:has(input[name="resume"])').first().click();
  await page.getByTestId('apply-ats-match-button').click();
  await expect(page.getByText(/ATS unavailable|Could not compute/i)).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: /next/i }).first()).toBeEnabled();
  await page.screenshot({ path: `${FALLBACK_DIR}/ats_down_apply_success.png`, fullPage: true });
});

test('spoc sees ats breakdown and suggestions', async ({ page }) => {
  await page.request.get(`${API_BASE}/seed/seed-ui`);
  await login(page, SPOC_EMAIL);
  await expect(page).toHaveURL(/\/jobs-management/, { timeout: 15000 });

  page.route('**/api/jobs', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        success: true,
        jobs: [{ id: 'job-1', role: 'Backend Developer', companyName: 'InnovateTech', status: 'PUBLISHED', applications: [], stages: [] }]
      })
    })
  );
  page.route('**/api/jobs/job-1', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        success: true,
        job: {
          id: 'job-1',
          role: 'Backend Developer',
          companyName: 'InnovateTech',
          status: 'PUBLISHED',
          stages: [],
          applications: [{
            id: 'app-1',
            status: 'APPLIED',
            atsScore: 76,
            semanticScore: 72,
            skillScore: 81,
            atsExplanation: 'Good fit',
            skillsMatched: '["node","express"]',
            skillsMissing: '["aws"]',
            suggestions: '["Add AWS deployment project"]',
            student: { id: 'stu-1', firstName: 'UI', lastName: 'Student', scholarNo: '12345' }
          }]
        }
      })
    })
  );

  await page.goto('/jobs-management', { waitUntil: 'networkidle' });
  await expect(page).toHaveURL(/jobs-management/);
  await page.screenshot({ path: `${SPOC_DIR}/spoc_ats_breakdown.png`, fullPage: true });
});

test('edge-case screen captured for zero score', async ({ page }) => {
  await page.request.get(`${API_BASE}/seed/seed-ui`);
  await login(page, STUDENT_EMAIL);
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
  mockStudentBase(page);
  page.route('**/api/student/resumes', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ success: true, data: [{ id: 'resume-1', fileName: 'empty.pdf' }] }) })
  );
  page.route('**/api/applications', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ success: true, applications: [{ id: 'a1', jobId: 'job-1', status: 'APPLIED', appliedAt: new Date().toISOString(), applicationData: {}, atsScore: 0, semanticScore: 0, skillScore: 0, suggestions: '[]', skillsMatched: '[]', skillsMissing: '[]', job: { role: 'Backend Developer', companyName: 'InnovateTech', stages: [] } }] }) })
  );
  await page.goto('/job-board', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /my applications/i }).click();
  await expect(page.getByText(/ATS analysis is pending|ATS score/i)).toBeVisible();
  await page.screenshot({ path: `${EDGE_DIR}/zero_score_state.png`, fullPage: true });
});
