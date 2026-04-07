const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:5000/api';
const MOCK_LOG = path.join(__dirname, '../tmp/whatsapp_payloads.log'); // Mock server reuse the same log file

async function verify() {
    try {
        console.log("--- MODULE 11: LINKEDIN ANNOUNCEMENTS VERIFICATION ---");

        // 1. Login as Coordinator
        console.log("1. Logging in as Coordinator...");
        const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
            email: 'coord_11@example.com',
            password: 'Password@123'
        });
        const token = loginRes.data.token;
        const headers = { Authorization: `Bearer ${token}` };

        // 2. Find the seeded Job
        const jobsRes = await axios.get(`${BASE_URL}/jobs`, { headers });
        const job = jobsRes.data.jobs.find(j => j.companyName === 'SocialMediaCo');
        if (!job) throw new Error("Seeded job not found");
        console.log(`   Found Job: ${job.companyName} (ID: ${job.id})`);

        // 3. Ensure LinkedIn Announcements are ENABLED via API
        console.log("\n2. Enabling LinkedIn Announcements via API...");
        await axios.patch(`${BASE_URL}/announcements/linkedin/settings`, { enabled: true }, { headers });
        const settingsRes = await axios.get(`${BASE_URL}/announcements/linkedin/settings`, { headers });
        console.log(`   Status: ${settingsRes.data.setting.value}`);

        // 4. Trigger Publication
        console.log("\n3. Triggering LinkedIn Publication...");
        // Clear previous mock logs
        if (fs.existsSync(MOCK_LOG)) fs.unlinkSync(MOCK_LOG);

        const publishRes = await axios.post(`${BASE_URL}/announcements/job/${job.id}/publish`, {}, { headers });
        console.log(`   Response: ${publishRes.data.message}`);

        // 5. Verify Mock Zapier Payload
        console.log("\n4. Verifying Mock Zapier Payload...");
        await new Promise(r => setTimeout(r, 2000)); // Wait for webhook

        if (!fs.existsSync(MOCK_LOG)) {
            console.error("   ❌ Error: No payload captured by mock server!");
            process.exit(1);
        }

        const logContent = fs.readFileSync(MOCK_LOG, 'utf8').trim();
        const payload = JSON.parse(logContent.split('\n').pop());
        
        console.log(`   Target URL: ${payload.url}`);
        console.log(`   Event Payload:`, JSON.stringify(payload.body, null, 2));

        // Validation checks
        if (payload.url.includes('/mock-zapier') && payload.body.company_name === 'SocialMediaCo') {
            const student = payload.body.placed_students[0];
            if (student.name === 'LinkedIn Star' && student.linkedin_url.includes('linkedinstar')) {
                console.log("   ✅ Payload fields verified (Company, Student Name, LinkedIn URL).");
            } else {
                console.error("   ❌ Payload data mismatch!");
                process.exit(1);
            }
        } else {
            console.error("   ❌ Payload URL or Company mismatch!");
            process.exit(1);
        }

        // 6. Verify Announcement Logs
        console.log("\n5. Checking LinkedIn Logs via API...");
        const logsRes = await axios.get(`${BASE_URL}/announcements/linkedin/logs`, { headers });
        console.log(`   Logs found: ${logsRes.data.logs.length}`);
        const latestLog = logsRes.data.logs[0];
        console.log(`   Latest Log Status: ${latestLog.zapStatus}`);

        if (latestLog.zapStatus === 'SUCCESS') {
            console.log("   ✅ Database log verified.");
        } else {
            console.error(`   ❌ Unexpected log status: ${latestLog.zapStatus}`);
            process.exit(1);
        }

        console.log("\n✅ MODULE 11 VERIFIED");

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
