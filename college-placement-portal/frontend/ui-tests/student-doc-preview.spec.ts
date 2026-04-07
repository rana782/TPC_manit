import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import path from 'path';

const STUDENT_EMAIL = 'ui_student@example.com';
const STUDENT_PASSWORD = 'Password@123';

const API_BASE = 'http://localhost:5001/api';

const DOCS_DIR = 'verification_screenshots/student_module/docs_preview_fix';
const PROFILE_PIC_DIR = 'verification_screenshots/student_module/profile_pic_preview';

const uploadsDir = path.resolve(process.cwd(), '../backend/uploads');

// Use existing files already present in backend/uploads
const PHOTO_FILE = path.join(uploadsDir, '841d4b1232e0688a7f7fd8b97f34080c.png');
const DOC_IMAGE_FILE = PHOTO_FILE;
const RESUME_PDF_FILE = path.join(uploadsDir, '0d6940db30b562fba47ae1e6abcd87bb.pdf');

const RESUME_IMAGE_FILE_URL = '/uploads/841d4b1232e0688a7f7fd8b97f34080c.png';

test.beforeAll(() => {
  fs.mkdirSync(DOCS_DIR, { recursive: true });
  fs.mkdirSync(PROFILE_PIC_DIR, { recursive: true });
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

test.describe('Student resume/doc/profile picture preview', () => {
  test('valid_case (photo immediate + doc preview + resume pdf preview)', async ({ page }) => {
    await loginAsStudent(page);

    // Ensure the "uploaded" document cards start from a clean slate,
    // since Profile.tsx uses `documents.find(...)` (first match wins).
    await page.route(`${API_BASE}/student/profile`, async (route) => {
      const response = await route.fetch();
      const json = await response.json().catch(() => null);
      if (json?.data) {
        json.data.documents = [];
        json.data.photoPath = null;
      }
      return route.fulfill({
        status: response.status(),
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(json),
      });
    });

    // Profile photo + documents
    await page.goto('/profile', { waitUntil: 'load' });
    await page.getByRole('button', { name: 'Documents' }).click();

    await expect(page.getByText('Profile Photo')).toBeVisible({ timeout: 10000 });

    await page.route(`${API_BASE}/student/photo`, async (route) => {
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ success: true, data: { photoPath: RESUME_IMAGE_FILE_URL } }),
      });
    });

    // Ensure the browser can load the mocked upload target
    await page.route('**/uploads/841d4b1232e0688a7f7fd8b97f34080c.png', async (route) => {
      const body = fs.readFileSync(PHOTO_FILE);
      return route.fulfill({ status: 200, body, contentType: 'image/png' });
    });

    const photoInput = page.locator('input[type="file"][accept="image/*"]').first();
    await photoInput.setInputFiles(PHOTO_FILE);

    await expect(page.getByText('Photo updated!')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('img[alt="Profile"]').first()).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: `${PROFILE_PIC_DIR}/valid_case.png` });

    // Upload a document (image) and verify embedded preview renders
    await page.route('**/api/student/document', async (route) => {
      return route.fulfill({
        status: 201,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          success: true,
          data: {
            id: 'doc_1',
            studentId: 'stu_1',
            type: 'COLLEGE_ID',
            fileName: 'doc.png',
            fileUrl: RESUME_IMAGE_FILE_URL,
            uploadedAt: new Date().toISOString(),
          },
        }),
      });
    });

    const collegeIdInput = page.locator('#upload-COLLEGE_ID');
    if (await collegeIdInput.count()) {
      await collegeIdInput.setInputFiles(DOC_IMAGE_FILE);
    } else {
      // Fallback: upload the first document input
      await page.locator('input[type="file"][id^="upload-"]').first().setInputFiles(DOC_IMAGE_FILE);
    }
    await expect(page.locator('img[alt="Preview COLLEGE_ID"]').first()).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: `${DOCS_DIR}/valid_case.png` });

    // Resume PDF preview (mocked)
    await page.route(`${API_BASE}/student/resumes`, async (route) => {
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          success: true,
          data: [
            {
              id: 'res_pdf_1',
              roleName: 'Resume PDF',
              fileName: 'resume.pdf',
              fileUrl: '/uploads/0d6940db30b562fba47ae1e6abcd87bb.pdf',
              isActive: true,
              createdAt: new Date().toISOString(),
            },
          ],
        }),
      });
    });

    await page.route('**/uploads/0d6940db30b562fba47ae1e6abcd87bb.pdf', async (route) => {
      const body = fs.readFileSync(RESUME_PDF_FILE);
      return route.fulfill({ status: 200, body, contentType: 'application/pdf' });
    });

    await page.goto('/resumes', { waitUntil: 'load' });
    await expect(page.locator('iframe').first()).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: `${DOCS_DIR}/ui_state.png` });
  });

  test('invalid_case (missing file paths -> fallback UI)', async ({ page }) => {
    await loginAsStudent(page);

    // Mock photo upload response with a missing file
    await page.route(`${API_BASE}/student/photo`, async (route) => {
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ success: true, data: { photoPath: '/uploads/does-not-exist.png' } }),
      });
    });

    // Mock document upload response with an invalid image URL
    await page.route('**/api/student/document', async (route) => {
      return route.fulfill({
        status: 201,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          success: true,
          data: {
            id: 'doc_bad_1',
            studentId: 'stu_bad',
            type: 'COLLEGE_ID',
            fileName: 'bad.png',
            fileUrl: '/uploads/does-not-exist.png',
            uploadedAt: new Date().toISOString(),
          },
        }),
      });
    });

    await page.goto('/profile', { waitUntil: 'load' });
    await page.getByRole('button', { name: 'Documents' }).click();

    const photoInput = page.locator('input[type="file"][accept="image/*"]').first();
    await photoInput.setInputFiles(PHOTO_FILE);

    const avatarImg = page.locator('img[alt="Profile"]').first();
    // Fallback should show (no avatar img)
    await expect(avatarImg).toHaveCount(0, { timeout: 15000 });
    await page.screenshot({ path: `${PROFILE_PIC_DIR}/invalid_case.png` });

    // Upload a doc to trigger "Preview unavailable"
    const collegeIdInput = page.locator('#upload-COLLEGE_ID');
    if (await collegeIdInput.count()) {
      await collegeIdInput.setInputFiles(DOC_IMAGE_FILE);
    } else {
      await page.locator('input[type="file"][id^="upload-"]').first().setInputFiles(DOC_IMAGE_FILE);
    }

    await expect(page.getByText('Preview unavailable').first()).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: `${DOCS_DIR}/invalid_case.png` });
  });

  test('edge_case (resume image preview)', async ({ page }) => {
    await loginAsStudent(page);

    // Ensure the mocked resume image can be loaded in the browser
    await page.route('**/uploads/841d4b1232e0688a7f7fd8b97f34080c.png', async (route) => {
      const body = fs.readFileSync(PHOTO_FILE);
      return route.fulfill({ status: 200, body, contentType: 'image/png' });
    });

    // Mock resume list to include an image resume
    await page.route(`${API_BASE}/student/resumes`, async (route) => {
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          success: true,
          data: [
            {
              id: 'res_img_1',
              roleName: 'Image Resume',
              fileName: 'resume.png',
              fileUrl: RESUME_IMAGE_FILE_URL,
              isActive: true,
              createdAt: new Date().toISOString(),
            },
          ],
        }),
      });
    });

    await page.goto('/resumes', { waitUntil: 'load' });
    await expect(page.getByText('My Resumes')).toBeVisible({ timeout: 10000 });

    // Image preview should render (not iframe-only)
    const img = page.locator('img[alt^="Resume:"]').first();
    await expect(img).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: `${DOCS_DIR}/edge_case.png` });
    await page.goto('/profile', { waitUntil: 'load' });
    await page.getByRole('button', { name: 'Documents' }).click();
    await page.screenshot({ path: `${PROFILE_PIC_DIR}/edge_case.png` });
  });

  test('ui_state (profile documents step visible)', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto('/profile', { waitUntil: 'load' });
    await page.getByRole('button', { name: 'Documents' }).click();
    await expect(page.getByText('Legal Documents')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: `${DOCS_DIR}/ui_state.png` });
    await page.screenshot({ path: `${PROFILE_PIC_DIR}/ui_state.png` });
  });
});

