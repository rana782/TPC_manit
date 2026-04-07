#!/bin/bash
echo "Running Smoke Tests..."

echo "1. Checking Backend Health Check (/api/health)"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/api/health)
if [ $STATUS -eq 200 ]; then
  echo "✅ Backend is healthy."
else
  echo "❌ Backend failed. Status: $STATUS"
  exit 1
fi

# -- Modules Validation Skeleton --
echo "2. Checking Module 02: Auth (Login)"
LOGIN_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d '{"email":"student@example.com","password":"Pass@123"}' http://localhost:5000/api/auth/login)
if [ $LOGIN_STATUS -eq 200 ]; then
  echo "✅ Auth Login logic healthy."
else
  echo "❌ Auth Login failed. Expected 200, got Status: $LOGIN_STATUS"
  exit 1
fi

# TODO (Module 02-04): Schema, Profile, Job creation endpoints
# TODO (Module 05-06): Applications, Status transitions, and Profile constraints
# TODO (Module 07): ATS Scoring evaluation checks
# TODO (Module 08-09): Notifications & Webhook mock checks

echo "All baseline smoke tests passed!"
