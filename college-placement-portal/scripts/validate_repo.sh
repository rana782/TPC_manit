#!/bin/bash
# validate_repo.sh — Repo health checks (Module 01)
# Runs: node/npm/prisma version checks, backend + frontend tsc compilation.
set -e

echo "=== System Healthcheck ==="
echo "Node Version: $(node -v)" || { echo "❌ Node is not installed"; exit 1; }
echo "NPM Version:  $(npm -v)"  || { echo "❌ NPM is not installed"; exit 1; }

echo ""
echo "=== Backend Validation ==="
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
BACKEND_DIR="$DIR/../backend"
FRONTEND_DIR="$DIR/../frontend"

if [ ! -d "$BACKEND_DIR" ]; then
  echo "❌ Backend directory not found at $BACKEND_DIR"
  exit 1
fi

cd "$BACKEND_DIR"

echo "Checking Prisma CLI..."
npx prisma --version || { echo "❌ Prisma not found"; exit 1; }
echo "✅ Prisma OK"

echo "TypeScript compilation (backend)..."
npx tsc --noEmit && echo "✅ Backend tsc OK" || { echo "❌ Backend tsc FAILED"; exit 1; }

echo ""
echo "=== Frontend Validation ==="
if [ ! -d "$FRONTEND_DIR" ]; then
  echo "❌ Frontend directory not found at $FRONTEND_DIR"
  exit 1
fi

cd "$FRONTEND_DIR"
echo "TypeScript compilation (frontend)..."
npx tsc --noEmit && echo "✅ Frontend tsc OK" || { echo "❌ Frontend tsc FAILED"; exit 1; }

echo ""
echo "=== Scripts Validation Complete! ==="
