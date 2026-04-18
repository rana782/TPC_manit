# TPC Portal First Deployment (Supabase + Render + Vercel)

This repository is now prepared for:
- **Backend API** on Render (`render.yaml`)
- **Frontend** on Vercel (`frontend/vercel.json`)
- **Database** on Supabase (`DATABASE_URL`)

This guide is optimized for first-time deployment and keeps manual work minimal.

---

## 0) What is already automated

- Render blueprint file: `render.yaml` (service config, health check, build/start commands).
- Backend production start runs migrations automatically:
  - `npm run start:prod` -> `prisma migrate deploy` then `node dist/server.js`.
- Frontend SPA routing is configured via `frontend/vercel.json`.
- Deployment preflight checker:
  - `node scripts/deploy-check.mjs`
- Post-deploy smoke checker:
  - `node scripts/post-deploy-check.mjs <api-url> <web-url>`
- Production-safe baseline seed behavior:
  - baseline auto-seed is **off by default in production**.

---

## 1) One-time prerequisites (manual)

1. Create/confirm accounts:
   - [Supabase](https://supabase.com/)
   - [Render](https://render.com/)
   - [Vercel](https://vercel.com/)
2. Ensure this repo is pushed to GitHub.
3. Open terminal in `college-placement-portal` folder for local helper scripts.

---

## 2) Configure Supabase (manual)

1. In Supabase, create/select your project.
2. Go to **Project Settings -> Database**.
3. Copy the **Connection string** (URI format), and ensure it includes `sslmode=require`.
4. Keep this value for Render env:
   - `DATABASE_URL=postgresql://...`

---

## 3) Backend on Render (mostly automated)

### 3.1 Create service from blueprint (manual clicks)

1. In Render dashboard: **New -> Blueprint**.
2. Connect this GitHub repository.
3. Render detects `render.yaml` automatically.
4. Select service `tpc-portal-api` and create it.

### 3.2 Set required environment variables (manual)

In Render service -> **Environment**, set:

- Required:
  - `DATABASE_URL` = Supabase connection string
  - `JWT_SECRET` = long random secret
  - `PORT_UI_URL` = your Vercel frontend URL (e.g. `https://your-app.vercel.app`)

- Recommended for production safety:
  - `AUTO_BASELINE_SEED=false`
  - `SKIP_AUTO_COMPANY_IMPORT=true`
  - `NOTIFICATIONS_ENABLED=false` (unless you are ready for live webhook traffic)
  - `ZAPIER_ENABLED=false` (unless webhook configured)
  - `CORS_ORIGIN=https://your-app.vercel.app,http://localhost:3000`

- Optional (only if used):
  - SMTP vars (`BREVO_SMTP_*`)
  - ATS/Nanonets vars (`ATS_LLM_*`, `NANONETS_*`)

### 3.3 Trigger deploy (manual click)

- Click **Deploy latest commit**.
- Wait until health check `/api/health` is green.
- Copy your backend URL, e.g. `https://tpc-portal-api.onrender.com`.

---

## 4) Frontend on Vercel (mostly automated)

### 4.1 Import project (manual clicks)

1. In Vercel: **Add New -> Project**.
2. Select this repo.
3. Set **Root Directory** to:
   - `college-placement-portal/frontend`
4. Build settings should auto-detect Vite.

### 4.2 Set environment variable (manual)

- `VITE_API_URL=https://<your-render-api-domain>`
  - Example: `https://tpc-portal-api.onrender.com`
  - Do **not** append `/api`.

### 4.3 Deploy (manual click)

- Click **Deploy** and wait for completion.
- Copy frontend URL, e.g. `https://tpc-portal.vercel.app`.

---

## 5) Update backend with final frontend URL (manual but important)

After Vercel URL is final:

1. In Render env, update:
   - `PORT_UI_URL=https://<your-vercel-url>`
   - `CORS_ORIGIN=https://<your-vercel-url>,http://localhost:3000`
2. Redeploy backend once.

---

## 6) Automated validation commands

Run from `college-placement-portal`:

```bash
node scripts/deploy-check.mjs
node scripts/post-deploy-check.mjs https://<render-api-url> https://<vercel-url>
```

Expected:
- `/api/health` returns success.
- `/api/jobs` returns a valid response (may be empty list depending on data).
- Frontend home URL returns 200.

---

## 7) First login/data notes

- If database is empty, create coordinator/spoc seed data using your existing seed scripts intentionally.
- Baseline demo seed is disabled by default in production unless explicitly enabled.
- Render free tier can sleep; first API request may be slow after inactivity.

---

## 8) Troubleshooting quick map

- **Frontend cannot hit API**:
  - Check `VITE_API_URL` on Vercel (must be Render base URL, no `/api` suffix required).
- **CORS error**:
  - Ensure `CORS_ORIGIN` contains exact Vercel domain.
- **Database migration error**:
  - Verify Supabase `DATABASE_URL` and SSL option.
- **502/healthcheck fail on Render**:
  - Check Render logs for Prisma migration failure or missing env vars.

