#!/bin/bash
API="http://localhost:5000/api"

# 1. Register student
curl -s -X POST $API/auth/signup -H "Content-Type: application/json" -d '{"name": "Demo Student", "email": "demo_ui_student@example.com", "password": "Password@123", "role": "STUDENT"}' > /dev/null
# Mark verified directly in DB to skip OTP
docker exec college-placement-portal-db-1 psql -U admin -d placement_db -c "UPDATE \"User\" SET \"isVerified\" = true WHERE email = 'demo_ui_student@example.com';" > /dev/null

# 2. Login
TOKEN=$(curl -s -X POST $API/auth/login -H "Content-Type: application/json" -d '{"email": "demo_ui_student@example.com", "password": "Password@123"}' | grep -o '"token":"[^"]*' | cut -d'"' -f4)

# 3. Create profile
curl -s -X PUT $API/student/profile -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{
  "firstName": "Demo", "lastName": "Student", "branch": "CS", "course": "B.Tech",
  "phone": "9998887776", "scholarNo": "SCH123", "dob": "2000-01-01",
  "tenthPct": 90, "tenthYear": 2016, "twelfthPct": 90, "twelfthYear": 2018,
  "semester": 7, "sgpa": 9.0, "cgpa": 9.0, "backlogs": 0
}' > /dev/null

# 4. Upload fake PDFs (bypassing multer by directly injecting into DB via SQL)
STUDENT_ID=$(docker exec college-placement-portal-db-1 psql -U admin -d placement_db -t -c "SELECT s.id FROM \"Student\" s JOIN \"User\" u ON u.id = s.\"userId\" WHERE u.email = 'demo_ui_student@example.com';" | xargs)

# Create two dummy resume records
docker exec college-placement-portal-db-1 psql -U admin -d placement_db -c "INSERT INTO \"Resume\" (id, \"studentId\", \"fileName\", \"fileUrl\", \"isActive\", \"roleName\", \"createdAt\", \"updatedAt\") VALUES ('res_1', '$STUDENT_ID', 'frontend_resume.pdf', '/uploads/fail.pdf', true, 'Frontend Dev', now(), now());" > /dev/null
docker exec college-placement-portal-db-1 psql -U admin -d placement_db -c "INSERT INTO \"Resume\" (id, \"studentId\", \"fileName\", \"fileUrl\", \"isActive\", \"roleName\", \"createdAt\", \"updatedAt\") VALUES ('res_2', '$STUDENT_ID', 'backend_resume.pdf', '/uploads/fail.pdf', true, 'Backend Dev', now(), now());" > /dev/null

# 5. Create a SPOC and a Job directly via SQL
docker exec college-placement-portal-db-1 psql -U admin -d placement_db -c "INSERT INTO \"User\" (id, email, password, role, \"isVerified\", \"createdAt\", \"updatedAt\") VALUES ('spoc_1', 'ui_spoc@example.com', 'pass', 'SPOC', true, now(), now()) ON CONFLICT DO NOTHING;" > /dev/null
docker exec college-placement-portal-db-1 psql -U admin -d placement_db -c "INSERT INTO \"Job\" (id, title, company, description, \"requiredProfileFields\", \"postedById\", deadline, \"createdAt\", \"updatedAt\") VALUES ('job_1', 'UI Engineer', 'Tech UI Corp', 'Looking for Frontend Dev', '[\"resume\"]'::jsonb, 'spoc_1', now() + interval '30 days', now(), now()) ON CONFLICT DO NOTHING;" > /dev/null

echo "Data seeded successfully for demo_ui_student@example.com"
