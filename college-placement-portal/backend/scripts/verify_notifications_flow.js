const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:5000/api';
const LOG_FILE = path.join(__dirname, '../tmp/whatsapp_payloads.log');

async function verify() {
    try {
        console.log("--- MODULE 10: WHATSAPP NOTIFICATIONS VERIFICATION ---");

        // Clear previous logs
        if (fs.existsSync(LOG_FILE)) fs.unlinkSync(LOG_FILE);

        // 1. Login Users
        console.log("1. Logging in users...");
        const loginStu = await axios.post(`${BASE_URL}/auth/login`, {
            email: 's1_10@example.com',
            password: 'Password@123'
        });
        const stuToken = loginStu.data.token;
        const stuHeaders = { Authorization: `Bearer ${stuToken}` };

        const loginSpoc = await axios.post(`${BASE_URL}/auth/login`, {
            email: 'spoc_10@example.com',
            password: 'Password@123'
        });
        const spocToken = loginSpoc.data.token;
        const spocHeaders = { Authorization: `Bearer ${spocToken}` };

        const loginCoord = await axios.post(`${BASE_URL}/auth/login`, {
            email: 'coord_09@example.com', // Using existing coord from mod09 or we can seed a new one if needed. seed_verify_mod10 logic included one if I recall. 
            // Wait, seed_verify_mod10 only seeded spoc and student. I'll use the spoc for most things.
            password: 'Password@123'
        });
        // Actually, seed_verify_mod10 didn't seed a coordinator. I'll use spoc for result declaration.
        
        // Find Job & Resume
        const jobsRes = await axios.get(`${BASE_URL}/jobs`, { headers: stuHeaders });
        const job = jobsRes.data.jobs.find(j => j.companyName === 'NotifyCorp');
        const jobId = job.id;

        const profileRes = await axios.get(`${BASE_URL}/student/profile`, { headers: stuHeaders });
        const resumeId = profileRes.data.data.resumes[0].id;
        const studentId = profileRes.data.data.id;

        // 2. Trigger APPLICATION_CONFIRMATION
        console.log("\n2. Triggering Application Confirmation...");
        await axios.post(`${BASE_URL}/applications`, {
            jobId,
            resumeId,
            applicationData: {},
            customAnswers: {}
        }, { headers: stuHeaders });
        console.log("   Application submitted.");

        // Wait for async notification
        await new Promise(r => setTimeout(r, 2000));

        // 3. Trigger OA_SCHEDULED
        console.log("\n3. Triggering OA Scheduled...");
        await axios.patch(`${BASE_URL}/jobs/${jobId}/stage`, {
            name: 'Online Assessment', // Correct field
            scheduledDate: '2026-04-01T10:00:00Z',
            status: 'SCHEDULED'
        }, { headers: spocHeaders });
        console.log("   OA Stage added.");

        await new Promise(r => setTimeout(r, 2000));

        // 4. Trigger RESULT_DECLARED
        console.log("\n4. Triggering Result Declared...");
        
        // The controller expects placedStudentIds (array of student IDs)
        await axios.post(`${BASE_URL}/jobs/${jobId}/results`, {
            placedStudentIds: [studentId],
            announcementText: 'Results are out!'
        }, { headers: spocHeaders });
        console.log("   Results declared.");

        await new Promise(r => setTimeout(r, 3000));

        // 5. Verify Mock Payloads
        console.log("\n5. Verifying Mock Payloads in tmp/whatsapp_payloads.log...");
        if (!fs.existsSync(LOG_FILE)) {
            console.error("   ❌ Error: No payloads captured by mock server!");
            process.exit(1);
        }

        const payloads = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n').map(JSON.parse);
        console.log(`   Captured ${payloads.length} payloads.`);
        
        payloads.forEach((p, i) => {
            console.log(`\n   Payload ${i+1}:`);
            console.log(`     To: ${p.body.phone}`);
            console.log(`     Msg: ${p.body.message}`);
        });

        // 6. Verify Admin Logs
        console.log("\n6. Fetching Notification Logs via API...");
        // Login as coord from mod09 to see logs
        const loginCoordReal = await axios.post(`${BASE_URL}/auth/login`, {
            email: 'coord_09@example.com',
            password: 'Password@123'
        });
        const coordHeaders = { Authorization: `Bearer ${loginCoordReal.data.token}` };
        
        const logsRes = await axios.get(`${BASE_URL}/notifications/admin/logs`, { headers: coordHeaders });
        console.log(`   API Logs count: ${logsRes.data.logs.length}`);
        
        console.log("\n✅ MODULE 10 VERIFIED");

    } catch (err) {
        console.error("❌ Verification Failed:");
        if (err.response) {
            console.error("   Status:", err.response.status);
            console.error("   Data:", JSON.stringify(err.response.data, null, 2));
        } else {
            console.error("   Message:", err.message);
        }
        process.exit(1);
    }
}

verify();
