# College Placement Portal MVP

A modular, locally runnable MVP for a College Placement Portal SaaS.

## Run Instructions

### 1. Prerequisites
- Node.js (v18+)
- Docker (for PostgreSQL)

### 2. Configure Environment
```bash
# From the root directory:
cp .env.example .env
```

### 3. Start Database
```bash
docker-compose up -d
```

### 4. Setup Backend
```bash
cd backend
npm install
# Sync Prisma schema to db
npx prisma migrate dev --name init
```
*(Wait until migration is complete before proceeding)*
```bash
npm run seed
npm run dev
```

### 5. Setup Frontend
Open a new terminal.
```bash
cd frontend
npm install
npm run dev
```

## Production Deployment

For production setup and release steps, use:

- `DEPLOYMENT.md`

Quick summary:

```bash
# backend
cd backend
npm ci
npm run build
npm run start:prod

# frontend
cd ../frontend
npm ci
npm run build
```
