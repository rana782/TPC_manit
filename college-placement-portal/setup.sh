#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  College Placement Portal — Full Dev Stack Setup Script                    ║
# ║  Usage:  bash setup.sh                                                     ║
# ║  Flags:  SKIP_MIGRATE=true bash setup.sh   — skip DB migrations            ║
# ║          SKIP_SEED=true bash setup.sh      — skip DB seeding               ║
# ║          SKIP_MOCK=true bash setup.sh      — skip mock webhook server      ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -e

# ─── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info()    { echo -e "${BLUE}[INFO]${NC}  $1"; }
success() { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $1"; }
fail()    { echo -e "${RED}[FAIL]${NC}  $1"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

echo ""
echo "============================================="
echo "  College Placement Portal — Dev Setup"
echo "============================================="
echo ""

# ─── 1. Check Node.js ────────────────────────────────────────────────────────
info "Checking Node.js..."
if ! command -v node &> /dev/null; then
    fail "Node.js is not installed. Please install Node.js 18+ from https://nodejs.org"
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    fail "Node.js version must be >= 18. Current: $(node -v)"
fi
success "Node.js $(node -v) detected"

# ─── 2. Check npm ────────────────────────────────────────────────────────────
info "Checking npm..."
if ! command -v npm &> /dev/null; then
    fail "npm is not installed."
fi
success "npm $(npm -v) detected"

# ─── 3. Check Docker ─────────────────────────────────────────────────────────
info "Checking Docker..."
if ! command -v docker &> /dev/null; then
    fail "Docker is not installed. Please install Docker Desktop from https://docs.docker.com/get-docker/"
fi
success "Docker $(docker --version | awk '{print $3}' | tr -d ',') detected"

# ─── 4. Check Docker Compose ─────────────────────────────────────────────────
info "Checking Docker Compose..."
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
    success "Docker Compose (plugin) detected"
elif command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
    success "docker-compose (standalone) detected"
else
    fail "Docker Compose is not installed."
fi

# ─── 5. Start PostgreSQL via Docker Compose ───────────────────────────────────
info "Starting PostgreSQL container..."
cd "$SCRIPT_DIR"
$COMPOSE_CMD up -d

# Wait for Postgres to be ready
info "Waiting for PostgreSQL to be ready..."
MAX_RETRIES=30
RETRY=0
until docker exec $($COMPOSE_CMD ps -q db) pg_isready -U admin -d placement_db &> /dev/null; do
    RETRY=$((RETRY + 1))
    if [ $RETRY -ge $MAX_RETRIES ]; then
        fail "PostgreSQL did not become ready in time (${MAX_RETRIES}s)"
    fi
    sleep 1
done
success "PostgreSQL is ready on port 5433"

# ─── 6. Setup Backend .env ────────────────────────────────────────────────────
info "Setting up backend environment..."
if [ ! -f "$BACKEND_DIR/.env" ]; then
    if [ -f "$BACKEND_DIR/.env.template" ]; then
        cp "$BACKEND_DIR/.env.template" "$BACKEND_DIR/.env"
        success "Created backend/.env from .env.template"
    elif [ -f "$BACKEND_DIR/.env.example" ]; then
        cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
        success "Created backend/.env from .env.example"
    else
        warn "No .env template found for backend. Creating minimal .env..."
        cat > "$BACKEND_DIR/.env" <<'ENVEOF'
PORT=5000
DATABASE_URL="postgresql://admin:adminpassword@localhost:5433/placement_db?schema=public"
JWT_SECRET="supersecretjwtkey_change_in_production"
NODE_ENV=development
ATS_ENGINE=sbert
ZAPIER_ENABLED=false
ZAPIER_LINKEDIN_ENABLED=false
WHATSAPP_ENABLED=false
NOTIFICATIONS_ENABLED=false
PORT_UI_URL=http://localhost:3000
ENVEOF
        success "Created minimal backend/.env"
    fi
else
    success "backend/.env already exists — skipping"
fi

# ─── 7. Install Backend Dependencies ─────────────────────────────────────────
info "Installing backend dependencies..."
cd "$BACKEND_DIR"
npm install
success "Backend dependencies installed"

# ─── 8. Prisma Generate ──────────────────────────────────────────────────────
info "Generating Prisma Client..."

# Check if schema.prisma needs to be switched to PostgreSQL
CURRENT_PROVIDER=$(grep 'provider' prisma/schema.prisma | head -2 | tail -1)
if echo "$CURRENT_PROVIDER" | grep -q "sqlite"; then
    warn "schema.prisma is set to SQLite. Switching to PostgreSQL for Docker dev..."
    sed -i.bak 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma
    sed -i.bak 's|url      = "file:./dev.db"|url      = env("DATABASE_URL")|' prisma/schema.prisma
    sed -i.bak 's|url = "file:./dev.db"|url = env("DATABASE_URL")|' prisma/schema.prisma
    success "Switched schema.prisma to PostgreSQL"
fi

npx prisma generate
success "Prisma Client generated"

# ─── 9. Prisma Migrate ───────────────────────────────────────────────────────
if [ "${SKIP_MIGRATE}" = "true" ]; then
    warn "SKIP_MIGRATE=true — Skipping database migrations"
else
    info "Running Prisma migrations..."
    npx prisma migrate dev --name init 2>&1 || {
        warn "Migration may have already been applied. Attempting migrate deploy..."
        npx prisma migrate deploy 2>&1 || warn "Migration failed — database may already be up to date"
    }
    success "Database migrations complete"
fi

# ─── 10. Seed Database ───────────────────────────────────────────────────────
if [ "${SKIP_SEED}" = "true" ]; then
    warn "SKIP_SEED=true — Skipping database seeding"
else
    info "Seeding database..."
    npm run seed 2>&1 || warn "Seeding may have failed (data may already exist)"
    success "Database seeded"
fi

# ─── 11. Start Mock Webhook Server (Background) ──────────────────────────────
if [ "${SKIP_MOCK}" = "true" ]; then
    warn "SKIP_MOCK=true — Skipping mock webhook server"
else
    info "Starting mock webhook server on port 9001..."
    if [ -f "$BACKEND_DIR/scripts/ui_mock_server.js" ]; then
        # Kill any existing process on 9001
        lsof -ti:9001 | xargs kill -9 2>/dev/null || true
        node "$BACKEND_DIR/scripts/ui_mock_server.js" &
        MOCK_PID=$!
        sleep 1
        if kill -0 $MOCK_PID 2>/dev/null; then
            success "Mock webhook server started (PID: $MOCK_PID) on http://localhost:9001"
        else
            warn "Mock server failed to start — continuing without it"
        fi
    else
        warn "ui_mock_server.js not found — skipping mock server"
    fi
fi

# ─── 12. Setup Frontend .env ─────────────────────────────────────────────────
info "Setting up frontend environment..."
if [ ! -f "$FRONTEND_DIR/.env" ]; then
    if [ -f "$FRONTEND_DIR/.env.template" ]; then
        cp "$FRONTEND_DIR/.env.template" "$FRONTEND_DIR/.env"
    else
        echo 'VITE_API_URL=http://localhost:5000' > "$FRONTEND_DIR/.env"
    fi
    success "Created frontend/.env"
else
    success "frontend/.env already exists — skipping"
fi

# ─── 13. Install Frontend Dependencies ───────────────────────────────────────
info "Installing frontend dependencies..."
cd "$FRONTEND_DIR"
npm install
success "Frontend dependencies installed"

# ─── 14. Start Backend Dev Server (Background) ───────────────────────────────
info "Starting backend dev server..."
cd "$BACKEND_DIR"
npm run dev &
BACKEND_PID=$!
sleep 3

if kill -0 $BACKEND_PID 2>/dev/null; then
    success "Backend running (PID: $BACKEND_PID) on http://localhost:5000"
else
    warn "Backend may have failed to start — check logs"
fi

# ─── 15. Start Frontend Dev Server (Background) ──────────────────────────────
info "Starting frontend dev server..."
cd "$FRONTEND_DIR"
npm run dev &
FRONTEND_PID=$!
sleep 3

if kill -0 $FRONTEND_PID 2>/dev/null; then
    success "Frontend running (PID: $FRONTEND_PID) on http://localhost:3000"
else
    warn "Frontend may have failed to start — check logs"
fi

# ─── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo "============================================="
echo -e "  ${GREEN}Setup Complete!${NC}"
echo "============================================="
echo ""
echo "  URLs:"
echo "    Frontend:       http://localhost:3000"
echo "    Backend API:    http://localhost:5000"
echo "    Health Check:   http://localhost:5000/api/health"
echo "    Mock Server:    http://localhost:9001/health"
echo "    Prisma Studio:  cd backend && npx prisma studio"
echo ""
echo "  Default Logins (from seed):"
echo "    Student:     student@example.com / Pass@123"
echo "    SPOC:        spoc@example.com / Pass@123"
echo "    Coordinator: coord@example.com / Pass@123"
echo ""
echo "  Stop all services:"
echo "    kill $BACKEND_PID $FRONTEND_PID ${MOCK_PID:-} 2>/dev/null"
echo "    docker compose down"
echo ""
echo "  Logs: Press Ctrl+C to stop foreground output"
echo ""

# Keep script alive to show logs
wait
