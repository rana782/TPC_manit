import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';

const API_BASE = 'http://localhost:5001/api';
const STUDENT_EMAIL = 'ui_student@example.com';
const PASSWORD = 'Password@123';
const ROOT = 'verification_screenshots/company_json_system/student_view';

function ensureDir() {
  fs.mkdirSync(ROOT, { recursive: true });
}

async function seedAndLoginStudent(page: Page) {
  await page.request.get(`${API_BASE}/seed/seed-ui`);
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').fill(STUDENT_EMAIL);
  await page.getByPlaceholder('Enter your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
}

test.beforeAll(() => {
  ensureDir();
});

test('student job card shows DB company intelligence (Shell)', async ({ page }) => {
  await seedAndLoginStudent(page);
  page.route('**/api/jobs', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({
        success: true,
        jobs: [
          {
            id: 'job-shell-1',
            role: 'Graduate Engineer',
            companyName: 'Shell',
            description: 'Shell role',
            jobType: 'Full-Time',
            ctc: '12',
            cgpaMin: 0,
            eligibleBranches: '["CSE"]',
            requiredProfileFields: '["resume"]',
            customQuestions: '[]',
            applicationDeadline: '2030-01-01T00:00:00.000Z',
            status: 'PUBLISHED'
          }
        ]
      })
    })
  );
  page.route('**/api/student/resumes', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ success: true, data: [] }) })
  );
  page.route('**/api/applications', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ success: true, applications: [] }) })
  );
  page.route('**/api/student/profile', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ success: true, data: { isLocked: false, lockedReason: null } }) })
  );

  await page.goto('/job-board', { waitUntil: 'networkidle' });
  await expect(page.getByText('3.9/5')).toBeVisible();
  await expect(page.getByText(/\(2,700 reviews\)/)).toBeVisible();
  await expect(page.getByText(/Highly Rated:/i)).toBeVisible();
  await expect(page.getByText(/Critically Rated:/i)).toBeVisible();
  await page.screenshot({ path: `${ROOT}/valid_case.png`, fullPage: true });
});
