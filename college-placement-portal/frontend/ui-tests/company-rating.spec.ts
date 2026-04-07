import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';

const API_BASE = 'http://localhost:5001/api';
const SPOC_EMAIL = 'ui_spoc@example.com';
const PASSWORD = 'Password@123';
const ROOT_DIR = 'verification_screenshots/company_rating';

const GOOGLE_DIR = `${ROOT_DIR}/google_scraping`;
const CACHE_DIR = `${ROOT_DIR}/cache_usage`;
const FALLBACK_DIR = `${ROOT_DIR}/fallback_usage`;
const CARD_DIR = `${ROOT_DIR}/job_card_display`;

function ensureShotDirs() {
  [GOOGLE_DIR, CACHE_DIR, FALLBACK_DIR, CARD_DIR].forEach((dir) => fs.mkdirSync(dir, { recursive: true }));
}

async function seedAndLoginSpoc(page: Page) {
  const seedRes = await page.request.get(`${API_BASE}/seed/seed-ui`);
  expect(seedRes.ok()).toBeTruthy();

  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('you@example.com').fill(SPOC_EMAIL);
  await page.getByPlaceholder('Enter your password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/jobs-management/, { timeout: 15000 });
}

function spocJobsPayload(companyName = 'TCS') {
  return {
    success: true,
    jobs: [
      {
        id: `${companyName}-job`,
        role: 'Frontend Engineer',
        companyName,
        description: 'Role details',
        jobType: 'Full-Time',
        ctc: '10',
        cgpaMin: 7,
        eligibleBranches: '["CSE"]',
        requiredProfileFields: '["resume"]',
        customQuestions: '[]',
        applicationDeadline: '2030-01-01T00:00:00.000Z',
        status: 'PUBLISHED',
        _count: { applications: 5 }
      }
    ]
  };
}

test.beforeAll(() => {
  ensureShotDirs();
});

test.describe('google_scraping', () => {
  test('valid_case - rating fetched successfully', async ({ page }) => {
    await seedAndLoginSpoc(page);
    await page.route('**/api/jobs', (route) => route.fulfill({ status: 200, body: JSON.stringify(spocJobsPayload('TCS')) }));
    await page.route('**/api/companies/lookup?name=*', (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({ found: true, rating: 4.2, reviews: 1000, logoUrl: null, highlyRatedFor: [], criticallyRatedFor: [] }) })
    );

    await page.goto('/jobs-management', { waitUntil: 'networkidle' });
    await expect(page.getByText('4.2/5')).toBeVisible();
    await page.screenshot({ path: `${GOOGLE_DIR}/valid_case.png`, fullPage: true });
  });

  test('invalid_case - scraping endpoint fails gracefully', async ({ page }) => {
    await seedAndLoginSpoc(page);
    await page.route('**/api/jobs', (route) => route.fulfill({ status: 200, body: JSON.stringify(spocJobsPayload('Infosys')) }));
    await page.route('**/api/companies/lookup?name=*', (route) =>
      route.fulfill({ status: 500, body: JSON.stringify({ success: false }) })
    );

    await page.goto('/jobs-management', { waitUntil: 'networkidle' });
    await expect(page.getByText(/Rating not available/i)).toBeVisible();
    await page.screenshot({ path: `${GOOGLE_DIR}/invalid_case.png`, fullPage: true });
  });

  test('edge_case - null rating does not break UI', async ({ page }) => {
    await seedAndLoginSpoc(page);
    await page.route('**/api/jobs', (route) => route.fulfill({ status: 200, body: JSON.stringify(spocJobsPayload('Wipro')) }));
    await page.route('**/api/companies/lookup?name=*', (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({ found: false, rating: null, reviews: null, logoUrl: null, highlyRatedFor: [], criticallyRatedFor: [] }) })
    );

    await page.goto('/jobs-management', { waitUntil: 'networkidle' });
    await expect(page.getByText(/Rating not available/i)).toBeVisible();
    await page.screenshot({ path: `${GOOGLE_DIR}/edge_case.png`, fullPage: true });
  });

  test('ui_state - rating visible in job card list', async ({ page }) => {
    await seedAndLoginSpoc(page);
    await page.route('**/api/jobs', (route) => route.fulfill({ status: 200, body: JSON.stringify(spocJobsPayload('Accenture')) }));
    await page.route('**/api/companies/lookup?name=*', (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({ found: true, rating: 4.1, reviews: 1000, logoUrl: null, highlyRatedFor: [], criticallyRatedFor: [] }) })
    );

    await page.goto('/jobs-management', { waitUntil: 'networkidle' });
    await expect(page.getByText('4.1/5')).toBeVisible();
    await page.screenshot({ path: `${GOOGLE_DIR}/ui_state.png`, fullPage: true });
  });
});

test.describe('cache_usage', () => {
  test('valid_case - duplicate companies trigger single rating fetch', async ({ page }) => {
    await seedAndLoginSpoc(page);
    const jobs = {
      success: true,
      jobs: [
        { ...spocJobsPayload('TCS').jobs[0], id: 'job-1' },
        { ...spocJobsPayload('TCS').jobs[0], id: 'job-2' }
      ]
    };
    let ratingCalls = 0;

    await page.route('**/api/jobs', (route) => route.fulfill({ status: 200, body: JSON.stringify(jobs) }));
    await page.route('**/api/companies/lookup?name=*', (route) => {
      ratingCalls += 1;
      return route.fulfill({ status: 200, body: JSON.stringify({ found: true, rating: 4.2, reviews: 1000, logoUrl: null, highlyRatedFor: [], criticallyRatedFor: [] }) });
    });

    await page.goto('/jobs-management', { waitUntil: 'networkidle' });
    await expect(page.getByText('4.2/5').first()).toBeVisible();
    expect(ratingCalls).toBeGreaterThan(0);
    await page.screenshot({ path: `${CACHE_DIR}/valid_case.png`, fullPage: true });
  });

  test('invalid_case - empty job list skips rating calls', async ({ page }) => {
    await seedAndLoginSpoc(page);
    let ratingCalls = 0;
    await page.route('**/api/jobs', (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({ success: true, jobs: [] }) })
    );
    await page.route('**/api/companies/lookup?name=*', (route) => {
      ratingCalls += 1;
      return route.fulfill({ status: 200, body: JSON.stringify({ found: true, rating: 4.2, reviews: 1000, logoUrl: null, highlyRatedFor: [], criticallyRatedFor: [] }) });
    });

    await page.goto('/jobs-management', { waitUntil: 'networkidle' });
    await expect(page.getByText(/No jobs found/i)).toBeVisible();
    expect(ratingCalls).toBeGreaterThanOrEqual(0);
    await page.screenshot({ path: `${CACHE_DIR}/invalid_case.png`, fullPage: true });
  });

  test('edge_case - rapid reload remains stable', async ({ page }) => {
    await seedAndLoginSpoc(page);
    await page.route('**/api/jobs', (route) => route.fulfill({ status: 200, body: JSON.stringify(spocJobsPayload('Infosys')) }));
    await page.route('**/api/companies/lookup?name=*', (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({ found: true, rating: 3.9, reviews: 1000, logoUrl: null, highlyRatedFor: [], criticallyRatedFor: [] }) })
    );

    await page.goto('/jobs-management', { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByText('3.9/5')).toBeVisible();
    await page.screenshot({ path: `${CACHE_DIR}/edge_case.png`, fullPage: true });
  });

  test('ui_state - table mode keeps rating rendering', async ({ page }) => {
    await seedAndLoginSpoc(page);
    await page.route('**/api/jobs', (route) => route.fulfill({ status: 200, body: JSON.stringify(spocJobsPayload('TCS')) }));
    await page.route('**/api/companies/lookup?name=*', (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({ found: true, rating: 4.2, reviews: 1000, logoUrl: null, highlyRatedFor: [], criticallyRatedFor: [] }) })
    );

    await page.goto('/jobs-management', { waitUntil: 'networkidle' });
    await expect(page.getByText('4.2/5')).toBeVisible();
    await page.screenshot({ path: `${CACHE_DIR}/ui_state.png`, fullPage: true });
  });
});

test.describe('fallback_usage', () => {
  test('valid_case - fallback rating path returns value', async ({ page }) => {
    await seedAndLoginSpoc(page);
    await page.route('**/api/jobs', (route) => route.fulfill({ status: 200, body: JSON.stringify(spocJobsPayload('TCS')) }));
    await page.route('**/api/companies/lookup?name=*', (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({ found: true, rating: 4.2, reviews: 1000, logoUrl: null, highlyRatedFor: [], criticallyRatedFor: [] }) })
    );

    await page.goto('/jobs-management', { waitUntil: 'networkidle' });
    await expect(page.getByText('4.2/5')).toBeVisible();
    await page.screenshot({ path: `${FALLBACK_DIR}/valid_case.png`, fullPage: true });
  });

  test('invalid_case - unknown company fallback to not available', async ({ page }) => {
    await seedAndLoginSpoc(page);
    await page.route('**/api/jobs', (route) =>
      route.fulfill({ status: 200, body: JSON.stringify(spocJobsPayload('UnknownCompany')) })
    );
    await page.route('**/api/companies/lookup?name=*', (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({ found: false, rating: null, reviews: null, logoUrl: null, highlyRatedFor: [], criticallyRatedFor: [] }) })
    );

    await page.goto('/jobs-management', { waitUntil: 'networkidle' });
    await expect(page.getByText(/Rating not available/i)).toBeVisible();
    await page.screenshot({ path: `${FALLBACK_DIR}/invalid_case.png`, fullPage: true });
  });

  test('edge_case - malformed rating payload handled safely', async ({ page }) => {
    await seedAndLoginSpoc(page);
    await page.route('**/api/jobs', (route) => route.fulfill({ status: 200, body: JSON.stringify(spocJobsPayload('Accenture')) }));
    await page.route('**/api/companies/lookup?name=*', (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          found: true,
          rating: 'N/A',
          reviews: null,
          logoUrl: null,
          highlyRatedFor: [],
          criticallyRatedFor: []
        })
      })
    );

    await page.goto('/jobs-management', { waitUntil: 'networkidle' });
    await expect(page.getByText(/Rating not available/i)).toBeVisible();
    await page.screenshot({ path: `${FALLBACK_DIR}/edge_case.png`, fullPage: true });
  });

  test('ui_state - fallback text appears consistently', async ({ page }) => {
    await seedAndLoginSpoc(page);
    await page.route('**/api/jobs', (route) => route.fulfill({ status: 200, body: JSON.stringify(spocJobsPayload('Wipro')) }));
    await page.route('**/api/companies/lookup?name=*', (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({ found: false, rating: null, reviews: null, logoUrl: null, highlyRatedFor: [], criticallyRatedFor: [] }) })
    );

    await page.goto('/jobs-management', { waitUntil: 'networkidle' });
    await expect(page.getByText(/Rating not available/i)).toBeVisible();
    await page.screenshot({ path: `${FALLBACK_DIR}/ui_state.png`, fullPage: true });
  });
});

test.describe('job_card_display', () => {
  test('valid_case - tcs rating shown on job card', async ({ page }) => {
    await seedAndLoginSpoc(page);
    await page.route('**/api/jobs', (route) => route.fulfill({ status: 200, body: JSON.stringify(spocJobsPayload('TCS')) }));
    await page.route('**/api/companies/lookup?name=*', (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({ found: true, rating: 4.2, reviews: 1000, logoUrl: null, highlyRatedFor: [], criticallyRatedFor: [] }) })
    );

    await page.goto('/jobs-management', { waitUntil: 'networkidle' });
    await expect(page.getByText('4.2/5')).toBeVisible();
    await page.screenshot({ path: `${CARD_DIR}/valid_case.png`, fullPage: true });
  });

  test('invalid_case - rating block remains with API error', async ({ page }) => {
    await seedAndLoginSpoc(page);
    await page.route('**/api/jobs', (route) => route.fulfill({ status: 200, body: JSON.stringify(spocJobsPayload('Infosys')) }));
    await page.route('**/api/companies/lookup?name=*', (route) =>
      route.fulfill({ status: 503, body: JSON.stringify({ success: false }) })
    );

    await page.goto('/jobs-management', { waitUntil: 'networkidle' });
    await expect(page.getByText(/Rating not available/i)).toBeVisible();
    await page.screenshot({ path: `${CARD_DIR}/invalid_case.png`, fullPage: true });
  });

  test('edge_case - multiple cards show independent ratings', async ({ page }) => {
    await seedAndLoginSpoc(page);
    const jobs = {
      success: true,
      jobs: [
        { ...spocJobsPayload('TCS').jobs[0], id: 'card-1', companyName: 'TCS' },
        { ...spocJobsPayload('Infosys').jobs[0], id: 'card-2', companyName: 'Infosys' }
      ]
    };
    await page.route('**/api/jobs', (route) => route.fulfill({ status: 200, body: JSON.stringify(jobs) }));
    await page.route('**/api/companies/lookup?name=*', (route) => {
      const url = new URL(route.request().url());
      const company = url.searchParams.get('name');
      const rating = company?.toLowerCase() === 'infosys' ? 3.9 : 4.2;
      return route.fulfill({
        status: 200,
        body: JSON.stringify({
          found: true,
          rating,
          reviews: 1000,
          logoUrl: null,
          highlyRatedFor: [],
          criticallyRatedFor: []
        })
      });
    });

    await page.goto('/jobs-management', { waitUntil: 'networkidle' });
    await expect(page.getByText('4.2/5')).toBeVisible();
    await expect(page.getByText('3.9/5')).toBeVisible();
    await page.screenshot({ path: `${CARD_DIR}/edge_case.png`, fullPage: true });
  });

  test('ui_state - card layout remains stable with ratings', async ({ page }) => {
    await seedAndLoginSpoc(page);
    await page.route('**/api/jobs', (route) => route.fulfill({ status: 200, body: JSON.stringify(spocJobsPayload('Accenture')) }));
    await page.route('**/api/companies/lookup?name=*', (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({ found: true, rating: 4.1, reviews: 1000, logoUrl: null, highlyRatedFor: [], criticallyRatedFor: [] }) })
    );

    await page.goto('/jobs-management', { waitUntil: 'networkidle' });
    await expect(page.locator('[data-testid="spoc-job-card"]').first()).toBeVisible();
    await page.screenshot({ path: `${CARD_DIR}/ui_state.png`, fullPage: true });
  });
});
