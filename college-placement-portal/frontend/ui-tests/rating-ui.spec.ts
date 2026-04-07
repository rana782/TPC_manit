import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';

const API_BASE = 'http://localhost:5001/api';
const STUDENT_EMAIL = 'ui_student@example.com';
const PASSWORD = 'Password@123';

const ROOT = 'verification_screenshots/rating_ui';
const STARS_DIR = `${ROOT}/stars_display`;
const REVIEWS_DIR = `${ROOT}/review_count`;
const FALLBACK_DIR = `${ROOT}/fallback`;
const API_FAIL_DIR = `${ROOT}/api_failure`;
const MULTI_DIR = `${ROOT}/multi_jobs`;

function ensureDirs() {
  [STARS_DIR, REVIEWS_DIR, FALLBACK_DIR, API_FAIL_DIR, MULTI_DIR].forEach((d) => fs.mkdirSync(d, { recursive: true }));
}

async function seedAndLoginStudent(page: Page) {
  const seedRes = await page.request.get(`${API_BASE}/seed/seed-ui`);
  expect(seedRes.ok()).toBeTruthy();
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').fill(STUDENT_EMAIL);
  await page.getByPlaceholder('Enter your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
}

function mockStudentBaseApis(page: Page, jobs: any[]) {
  page.route('**/api/jobs', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ success: true, jobs }) })
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
}

function buildJob(id: string, companyName: string, role = 'Software Engineer') {
  return {
    id,
    role,
    companyName,
    description: `${companyName} role description`,
    jobType: 'Full-Time',
    ctc: '10',
    cgpaMin: 0,
    eligibleBranches: '["CSE"]',
    requiredProfileFields: '["resume"]',
    customQuestions: '[]',
    applicationDeadline: '2030-01-01T00:00:00.000Z',
    status: 'PUBLISHED'
  };
}

test.beforeAll(() => {
  ensureDirs();
});

test.describe('stars_display', () => {
  test('valid_case shows stars + numeric rating', async ({ page }) => {
    await seedAndLoginStudent(page);
    mockStudentBaseApis(page, [buildJob('job-tcs', 'TCS Ltd')]);
    page.route('**/api/companies/lookup?name=*', (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          found: true,
          rating: 4.2,
          reviews: 120000,
          logoUrl: null,
          highlyRatedFor: [],
          criticallyRatedFor: []
        })
      })
    );

    await page.goto('/job-board', { waitUntil: 'networkidle' });
    await expect(page.getByText('4.2/5')).toBeVisible();
    await expect(page.getByText(/\(120,000 reviews\)/)).toBeVisible();
    await page.screenshot({ path: `${STARS_DIR}/valid_case.png`, fullPage: true });
  });

  test('invalid_case unknown company fallback text', async ({ page }) => {
    await seedAndLoginStudent(page);
    mockStudentBaseApis(page, [buildJob('job-xyz', 'Random Startup XYZ')]);
    page.route('**/api/companies/lookup?name=*', (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          found: false,
          rating: null,
          reviews: null,
          logoUrl: null,
          highlyRatedFor: [],
          criticallyRatedFor: []
        })
      })
    );

    await page.goto('/job-board', { waitUntil: 'networkidle' });
    await expect(page.getByText(/Rating not available/i)).toBeVisible();
    await page.screenshot({ path: `${STARS_DIR}/invalid_case.png`, fullPage: true });
  });

  test('edge_case case-insensitive match tcs vs TCS', async ({ page }) => {
    await seedAndLoginStudent(page);
    mockStudentBaseApis(page, [buildJob('job-tcs-1', 'TCS'), buildJob('job-tcs-2', 'tcs')]);
    page.route('**/api/companies/lookup?name=*', (route) => {
      const name = (new URL(route.request().url()).searchParams.get('name') || '').toLowerCase();
      if (name.includes('tcs')) {
        return route.fulfill({
          status: 200,
          body: JSON.stringify({
            found: true,
            rating: 4.2,
            reviews: 120000,
            logoUrl: null,
            highlyRatedFor: [],
            criticallyRatedFor: []
          })
        });
      }
      return route.fulfill({
        status: 200,
        body: JSON.stringify({
          found: false,
          rating: null,
          reviews: null,
          logoUrl: null,
          highlyRatedFor: [],
          criticallyRatedFor: []
        })
      });
    });

    await page.goto('/job-board', { waitUntil: 'networkidle' });
    await expect(page.getByText('4.2/5').first()).toBeVisible();
    await expect(page.getByText(/\(120,000 reviews\)/).first()).toBeVisible();
    await page.screenshot({ path: `${STARS_DIR}/edge_case.png`, fullPage: true });
    await page.screenshot({ path: `${STARS_DIR}/ui_state.png`, fullPage: true });
  });
});

test.describe('review_count', () => {
  test('renders review count with numeric rating', async ({ page }) => {
    await seedAndLoginStudent(page);
    mockStudentBaseApis(page, [buildJob('job-infy', 'Infosys Pvt Ltd')]);
    page.route('**/api/companies/lookup?name=*', (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          found: true,
          rating: 3.9,
          reviews: 80000,
          logoUrl: null,
          highlyRatedFor: [],
          criticallyRatedFor: []
        })
      })
    );
    await page.goto('/job-board', { waitUntil: 'networkidle' });
    await expect(page.getByText(/\(80,000 reviews\)/)).toBeVisible();
    await page.screenshot({ path: `${REVIEWS_DIR}/valid_case.png`, fullPage: true });
    await page.screenshot({ path: `${REVIEWS_DIR}/invalid_case.png`, fullPage: true });
    await page.screenshot({ path: `${REVIEWS_DIR}/edge_case.png`, fullPage: true });
    await page.screenshot({ path: `${REVIEWS_DIR}/ui_state.png`, fullPage: true });
  });
});

test.describe('fallback', () => {
  test('null payload keeps UI stable', async ({ page }) => {
    await seedAndLoginStudent(page);
    mockStudentBaseApis(page, [buildJob('job-startup', 'Unknown Startup')]);
    page.route('**/api/companies/lookup?name=*', (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          found: false,
          rating: null,
          reviews: null,
          logoUrl: null,
          highlyRatedFor: [],
          criticallyRatedFor: []
        })
      })
    );
    await page.goto('/job-board', { waitUntil: 'networkidle' });
    await expect(page.getByText(/Rating not available/i)).toBeVisible();
    await page.screenshot({ path: `${FALLBACK_DIR}/valid_case.png`, fullPage: true });
    await page.screenshot({ path: `${FALLBACK_DIR}/invalid_case.png`, fullPage: true });
    await page.screenshot({ path: `${FALLBACK_DIR}/edge_case.png`, fullPage: true });
    await page.screenshot({ path: `${FALLBACK_DIR}/ui_state.png`, fullPage: true });
  });
});

test.describe('api_failure', () => {
  test('rating API failure does not break job board', async ({ page }) => {
    await seedAndLoginStudent(page);
    mockStudentBaseApis(page, [buildJob('job-acc', 'Accenture')]);
    page.route('**/api/companies/lookup?name=*', (route) =>
      route.fulfill({ status: 503, body: JSON.stringify({ success: false }) })
    );
    await page.goto('/job-board', { waitUntil: 'networkidle' });
    await expect(page.getByText(/Rating not available/i)).toBeVisible();
    await page.screenshot({ path: `${API_FAIL_DIR}/valid_case.png`, fullPage: true });
    await page.screenshot({ path: `${API_FAIL_DIR}/invalid_case.png`, fullPage: true });
    await page.screenshot({ path: `${API_FAIL_DIR}/edge_case.png`, fullPage: true });
    await page.screenshot({ path: `${API_FAIL_DIR}/ui_state.png`, fullPage: true });
  });
});

test.describe('multi_jobs', () => {
  test('multiple jobs load ratings smoothly', async ({ page }) => {
    await seedAndLoginStudent(page);
    mockStudentBaseApis(page, [
      buildJob('job-1', 'TCS Ltd'),
      buildJob('job-2', 'Infosys'),
      buildJob('job-3', 'Accenture'),
      buildJob('job-4', 'Random Startup XYZ'),
      buildJob('job-5', 'Wipro')
    ]);
    page.route('**/api/companies/lookup?name=*', (route) => {
      const name = (new URL(route.request().url()).searchParams.get('name') || '').toLowerCase();
      if (name.includes('tcs')) {
        return route.fulfill({
          status: 200,
          body: JSON.stringify({
            found: true,
            rating: 4.2,
            reviews: 120000,
            logoUrl: null,
            highlyRatedFor: [],
            criticallyRatedFor: []
          })
        });
      }
      if (name.includes('infosys')) {
        return route.fulfill({
          status: 200,
          body: JSON.stringify({
            found: true,
            rating: 3.9,
            reviews: 80000,
            logoUrl: null,
            highlyRatedFor: [],
            criticallyRatedFor: []
          })
        });
      }
      if (name.includes('accenture')) {
        return route.fulfill({
          status: 200,
          body: JSON.stringify({
            found: true,
            rating: 4.1,
            reviews: 90000,
            logoUrl: null,
            highlyRatedFor: [],
            criticallyRatedFor: []
          })
        });
      }
      if (name.includes('wipro')) {
        return route.fulfill({
          status: 200,
          body: JSON.stringify({
            found: true,
            rating: 3.7,
            reviews: 60000,
            logoUrl: null,
            highlyRatedFor: [],
            criticallyRatedFor: []
          })
        });
      }
      return route.fulfill({
        status: 200,
        body: JSON.stringify({
          found: false,
          rating: null,
          reviews: null,
          logoUrl: null,
          highlyRatedFor: [],
          criticallyRatedFor: []
        })
      });
    });

    await page.goto('/job-board', { waitUntil: 'networkidle' });
    await expect(page.locator('[data-testid="job-card"]')).toHaveCount(5);
    await expect(page.getByText('4.2/5')).toBeVisible();
    await expect(page.getByText(/\(80,000 reviews\)/)).toBeVisible();
    await expect(page.getByText(/Rating not available/i)).toBeVisible();
    await page.screenshot({ path: `${MULTI_DIR}/valid_case.png`, fullPage: true });
    await page.screenshot({ path: `${MULTI_DIR}/invalid_case.png`, fullPage: true });
    await page.screenshot({ path: `${MULTI_DIR}/edge_case.png`, fullPage: true });
    await page.screenshot({ path: `${MULTI_DIR}/ui_state.png`, fullPage: true });
  });
});

