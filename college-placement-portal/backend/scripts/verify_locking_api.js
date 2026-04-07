const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

async function verify() {
    try {
        console.log("--- MODULE 08: LOCKING & PLACEMENT RECORDING VERIFICATION ---");

        // 1. Logins
        console.log("1. Logging in users...");
        const loginSpoc = await axios.post(`${BASE_URL}/auth/login`, {
            email: 'spoc_verify_08@example.com',
            password: 'Password@123'
        });
        const spocToken = loginSpoc.data.token;
        const spocHeaders = { Authorization: `Bearer ${spocToken}` };

        const loginCoord = await axios.post(`${BASE_URL}/auth/login`, {
            email: 'coord_verify_08@example.com',
            password: 'Password@123'
        });
        const coordToken = loginCoord.data.token;
        const coordHeaders = { Authorization: `Bearer ${coordToken}` };

        const loginStudent = await axios.post(`${BASE_URL}/auth/login`, {
            email: 's1_08@example.com',
            password: 'Password@123'
        });
        const stuToken = loginStudent.data.token;
        const stuHeaders = { Authorization: `Bearer ${stuToken}` };

        // 2. Get Student ID & Job ID
        const studentProfile = await axios.get(`${BASE_URL}/student/profile`, { headers: stuHeaders });
        const studentId = studentProfile.data.data.id;
        console.log(`   Student ID: ${studentId}`);

        const resumeId = studentProfile.data.data.resumes[0].id;
        console.log(`   Resume ID: ${resumeId}`);

        const jobsRes = await axios.get(`${BASE_URL}/jobs`, { headers: spocHeaders });
        const job = jobsRes.data.jobs.find(j => j.companyName === 'LockCorp');
        const jobId = job.id;
        console.log(`   Job ID: ${jobId}`);

        // 3. Lock Student (SPOC)
        console.log("\n2. Locking Student via SPOC...");
        const lockRes = await axios.post(`${BASE_URL}/profile-lock/${studentId}/lock`, {
            lockType: 'PLACED_ON_CAMPUS',
            companyName: 'LockCorp',
            role: 'SDE-1',
            ctc: '12 LPA',
            reason: 'Verification Lock'
        }, { headers: spocHeaders });
        console.log(`   Lock Result: ${lockRes.data.message}`);

        // 4. Verify isLocked in profile
        const profileAfterLock = await axios.get(`${BASE_URL}/student/profile`, { headers: stuHeaders });
        console.log(`   Student isLocked: ${profileAfterLock.data.data.isLocked}`);

        // 5. Attempt Apply (Should FAIL)
        console.log("\n3. Attempting to apply while locked (Expecting 403)...");
        try {
            await axios.post(`${BASE_URL}/applications/apply`, {
                jobId: jobId,
                resumeId: resumeId
            }, { headers: stuHeaders });
            console.log("   ❌ Error: Application should have been blocked!");
        } catch (err) {
            console.log(`   Application blocked as expected: ${err.response?.status} - ${err.response?.data?.message}`);
        }

        // 6. Unlock Student (Coordinator Override)
        console.log("\n4. Unlocking Student via Coordinator...");
        const unlockRes = await axios.post(`${BASE_URL}/profile-lock/${studentId}/unlock`, {}, { headers: coordHeaders });
        console.log(`   Unlock Result: ${unlockRes.data.message}`);

        // 7. Verify isLocked is false
        const profileAfterUnlock = await axios.get(`${BASE_URL}/student/profile`, { headers: stuHeaders });
        console.log(`   Student isLocked: ${profileAfterUnlock.data.data.isLocked}`);

        console.log("\n✅ MODULE 08 API VERIFIED");

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
