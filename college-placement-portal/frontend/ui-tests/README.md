# UI Tests (Playwright)

## Student Profile Form tests

Run with frontend and backend **already running**:

- **Backend**: `cd backend && npm run dev` (e.g. port 5000)
- **Frontend**: `cd frontend && npm run dev` (e.g. port 3000)

Then from `frontend`:

```bash
npx playwright test profile-form.spec.ts --project=desktop
```

Screenshots are written to `frontend/ui-tests/screenshots/` when tests run (one per validation/UI scenario). Seed user: `student@example.com` / `Pass@123` (ensure DB is seeded).
