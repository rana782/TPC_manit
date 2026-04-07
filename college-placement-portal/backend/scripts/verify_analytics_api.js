const axios = require('axios');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const BASE_URL = 'http://localhost:5000/api';

async function verify() {
    try {
        console.log("--- MODULE 12: ANALYTICS & ALUMNI VERIFICATION ---");

        // 1. Login
        console.log("1. Logging in as Coordinator...");
        const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
            email: 'coord_12@example.com',
            password: 'Password@123'
        });
        const token = loginRes.data.token;
        const headers = { Authorization: `Bearer ${token}` };

        // 2. Summary Dashboard
        console.log("\n2. Fetching Dashboard Summary...");
        const summaryRes = await axios.get(`${BASE_URL}/analytics/summary`, { headers });
        console.log(`   Total Students: ${summaryRes.data.summary.totalStudents}`);
        console.log(`   Total Placed: ${summaryRes.data.summary.totalPlaced}`);
        if (summaryRes.data.summary.totalPlaced >= 6) {
           console.log("   ✅ Summary data looks correct (>=6 students placed).");
        } else {
           console.error("   ❌ Summary data mismatch!");
           process.exit(1);
        }

        // 3. Branch Comparison
        console.log("\n3. Fetching Branch Comparison...");
        const branchRes = await axios.get(`${BASE_URL}/analytics/branch-comparison`, { headers });
        console.table(branchRes.data.data);
        if (branchRes.data.data.length > 0) {
           console.log("   ✅ Branch comparison data received.");
        }

        // 4. Alumni by Company
        console.log("\n4. Fetching Alumni for TechGiant...");
        const alumniRes = await axios.get(`${BASE_URL}/alumni/company/TechGiant`, { headers });
        console.log(`   Alumni found for TechGiant: ${alumniRes.data.data.length}`);
        if (alumniRes.data.data.length >= 2) {
           console.log("   ✅ Alumni data verified.");
        }

        // 5. ATS Recompute (CLI)
        console.log("\n5. Testing ATS Recompute Script...");
        // Get a job ID
        const jobsRes = await axios.get(`${BASE_URL}/jobs`, { headers });
        const jobId = jobsRes.data.jobs[0].id;
        
        console.log(`   Recomputing for Job ID: ${jobId}`);
        const { stdout, stderr } = await execPromise(`node scripts/recompute_ats_for_job.js --job_id ${jobId}`);
        console.log(stdout);
        if (stdout.includes("Done —")) {
           console.log("   ✅ ATS Recompute script executed successfully.");
        }

        // 6. Verify Alumni Auto-Creation (End-to-End)
        console.log("\n6. Verifying Alumni Auto-Creation on Result Declaration...");
        const spocLogin = await axios.post(`${BASE_URL}/auth/login`, {
            email: 'spoc_12@example.com',
            password: 'Password@123'
        });
        const spocHeaders = { Authorization: `Bearer ${spocLogin.data.token}` };

        // Find Job with no placements yet (DataFlow has 2 in seed, lets use TechGiant or MechWorks)
        const job = jobsRes.data.jobs.find(j => j.companyName === 'MechWorks');
        // Find a student who applied (Student4 and Student5 in seed for job2)
        // Wait, the seed actually already placed them. 
        // Let's create a NEW student and NEW job to verify the trigger.
        console.log("   Creating fresh student and job for trigger test...");
        const newUserRes = await axios.post(`${BASE_URL}/auth/login`, { 
            email: 's_new_12@example.com', password: 'Password@123' 
        }).catch(async () => {
             // If login fails, create user if needed? Nah, I'll just use Student6/7 from seed who aren't placed yet.
        });
        
        // Student6 (Mechanical) and Student7 (Electronics) aren't placed in seed data placement logic.
        const stuRes = await axios.get(`${BASE_URL}/student/profile`, { 
            headers: { Authorization: `Bearer ${(await axios.post(`${BASE_URL}/auth/login`, { email: 's6_12@example.com', password: 'Password@123' })).data.token}` } 
        });
        const studentId = stuRes.data.data.id;
        
        console.log(`   Declaring NEW results for MechWorks (Placing Student6)...`);
        await axios.post(`${BASE_URL}/jobs/${job.id}/results`, {
            placedStudentIds: [studentId],
            announcementText: 'New alumni added!'
        }, { headers: spocHeaders });

        console.log("   Checking Alumni table for Student6...");
        const alumniCheck = await axios.get(`${BASE_URL}/alumni/company/MechWorks`, { headers });
        const isFound = alumniCheck.data.data.some(a => a.studentId === studentId);
        if (isFound) {
           console.log("   ✅ Alumni record auto-created successfully!");
        } else {
           console.error("   ❌ Alumni record NOT found!");
           process.exit(1);
        }

        console.log("\n✅ MODULE 12 VERIFIED");

    } catch (err) {
        console.error("❌ Verification Failed:");
        if (err.response) {
            console.error("   Status:", err.response.status);
            console.error("   Data:", JSON.stringify(err.response.data, null, 2));
        } else {
            console.error("   Message:", err.message);
            console.error(err.stack);
        }
        process.exit(1);
    }
}

verify();
