#!/bin/bash

# Smoke tests for College Placement Portal
# Run this against a locally running node backend (`npm run dev`)

export API_URL="http://localhost:5000/api"

echo "=== ATS Smoke Tests ==="

# Assuming you have a valid student token, JOB_ID, and RESUME_ID
# Test ATS Score Computation manually
echo -e "\n---> Testing /api/ats/score (ATS Scoring)"
curl -s -X POST $API_URL/ats/score \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_STUDENT_TOKEN_HERE" \
  -d '{"jobId": "YOUR_JOB_ID_HERE", "resumeId": "YOUR_RESUME_ID_HERE"}'

echo -e "\n\n---> Testing /api/ats/batch-score"
curl -s -X POST $API_URL/ats/batch-score \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_STUDENT_TOKEN_HERE" \
  -d '{"jobId": "YOUR_JOB_ID_HERE", "resumeIds": ["YOUR_RESUME_ID_HERE"]}'

echo -e "\n\nDone."
