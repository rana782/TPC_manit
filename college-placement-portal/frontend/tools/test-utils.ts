import { execSync, spawn, ChildProcess } from 'child_process';
import http from 'http';

const API = 'http://localhost:5000';
const MOCK_PORT = 9001;

let mockProcess: ChildProcess | null = null;

/**
 * Seed the database via the backend's /api/seed/seed-ui endpoint.
 * This creates ui_student@example.com with 3 resumes + a seeded job.
 */
export async function seedDatabase(): Promise<void> {
  const res = await fetch(`${API}/api/seed/seed-ui`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Seed failed (${res.status}): ${text}`);
  }
  const body = await res.json();
  if (!body.success) throw new Error(`Seed returned success=false: ${JSON.stringify(body)}`);
}

/**
 * Start the mock server on the given port (default 9001).
 * If it's already running, skip.
 */
export async function startMockServer(port = MOCK_PORT): Promise<void> {
  // Check if already running
  const alive = await new Promise<boolean>((resolve) => {
    http.get(`http://localhost:${port}/health`, (res) => {
      resolve(res.statusCode === 200);
    }).on('error', () => resolve(false));
  });

  if (alive) {
    console.log(`[test-utils] Mock server already running on :${port}`);
    return;
  }

  console.log(`[test-utils] Starting mock server on :${port}...`);
  mockProcess = spawn('node', ['backend/scripts/ui_mock_server.js'], {
    cwd: process.cwd().replace(/frontend$/, ''),
    stdio: 'pipe',
    detached: false,
  });

  // Wait until it's responding
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const ok = await new Promise<boolean>((resolve) => {
      http.get(`http://localhost:${port}/health`, (res) => {
        resolve(res.statusCode === 200);
      }).on('error', () => resolve(false));
    });
    if (ok) {
      console.log(`[test-utils] Mock server ready`);
      return;
    }
  }
  throw new Error('Mock server did not start within 10s');
}

/**
 * Stop the mock server if we started it.
 */
export function stopMockServer(): void {
  if (mockProcess) {
    mockProcess.kill();
    mockProcess = null;
  }
}

/**
 * Login helper — returns JWT token.
 */
export async function loginAndGetToken(email: string, password: string): Promise<string> {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!body.success) throw new Error(`Login failed for ${email}: ${JSON.stringify(body)}`);
  return body.token;
}
