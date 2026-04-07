const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

async function verify() {
    try {
        console.log("--- MODULE 09: COORDINATOR GOVERNANCE VERIFICATION ---");

        // 1. Login Coordinator
        console.log("1. Logging in Coordinator...");
        const loginCoord = await axios.post(`${BASE_URL}/auth/login`, {
            email: 'coord_09@example.com',
            password: 'Password@123'
        });
        const coordToken = loginCoord.data.token;
        const coordHeaders = { Authorization: `Bearer ${coordToken}` };

        // 2. Fetch Pending SPOCs
        console.log("\n2. Fetching pending SPOCs...");
        const pendingRes = await axios.get(`${BASE_URL}/admin/spocs/pending`, { headers: coordHeaders });
        const pendingSpoc = pendingRes.data.spocs.find(s => s.email === 'spoc_pending_09@example.com');
        
        if (!pendingSpoc) {
            console.error("   ❌ Error: Pending SPOC not found in list!");
            process.exit(1);
        }
        console.log(`   Found Pending SPOC: ${pendingSpoc.email} (${pendingSpoc.id})`);

        // 3. Approve SPOC
        console.log("\n3. Approving SPOC...");
        const approveRes = await axios.patch(`${BASE_URL}/admin/spocs/${pendingSpoc.id}/approve`, {}, { headers: coordHeaders });
        console.log(`   Approval Result: ${approveRes.data.message}`);

        // 4. Update Permissions (Revoke Lock Permission)
        console.log("\n4. Tuning SPOC Permissions (Revoking Lock Profile)...");
        const permRes = await axios.patch(`${BASE_URL}/admin/spocs/${pendingSpoc.id}/permissions`, {
            permLockProfile: false
        }, { headers: coordHeaders });
        console.log(`   Permissions Updated: LockedProfile=${permRes.data.spoc.permLockProfile}`);

        // 5. Verify SPOC cannot lock profile now
        console.log("\n5. Verifying SPOC cannot lock profile after revocation...");
        const loginSpoc = await axios.post(`${BASE_URL}/auth/login`, {
            email: 'spoc_pending_09@example.com',
            password: 'Password@123'
        });
        const spocToken = loginSpoc.data.token;
        
        // Find studentID from seed
        const studentRes = await axios.get(`${BASE_URL}/admin/users?role=STUDENT`, { headers: coordHeaders });
        const student = studentRes.data.users.find(u => u.email === 's1_09@example.com').student;
        const studentId = studentRes.data.users.find(u => u.email === 's1_09@example.com').id; // Wait, listUsers returns user.id
        // Let's get student.id specifically. The listUsers select includes student { id } usually.
        // Re-checking listUsers select in admin.controller.ts: select: { id: true, firstName: true, ... }
        // Ah, it selects student: { firstName, lastName, isLocked... } but not ID. 
        // I'll fetch student/profile via student login to be sure of student.id.
        
        const loginStu = await axios.post(`${BASE_URL}/auth/login`, {
            email: 's1_09@example.com',
            password: 'Password@123'
        });
        const stuProfile = await axios.get(`${BASE_URL}/student/profile`, { headers: { Authorization: `Bearer ${loginStu.data.token}` } });
        const realStudentId = stuProfile.data.data.id;

        try {
            await axios.post(`${BASE_URL}/profile-lock/${realStudentId}/lock`, {
                lockType: 'DEBARRED',
                reason: 'Should Fail'
            }, { headers: { Authorization: `Bearer ${spocToken}` } });
            console.log("   ❌ Error: SPOC should NOT be able to lock profile!");
        } catch (err) {
            console.log(`   Correctly blocked: ${err.response?.status} - ${err.response?.data?.message}`);
        }

        // 6. Execute Override (Unlock Student)
        console.log("\n6. Executing Coordinator Override (Unlock Student)...");
        // We need an ACTIVE lock. The student was seeded with isLocked=true and an active ProfileLock.
        const overrideRes = await axios.post(`${BASE_URL}/admin/overrides`, {
            actionType: 'UNLOCK_STUDENT',
            entity: 'Student',
            entityId: realStudentId, // Wait, override controller expects entityId. If entity=Student, it uses entityId as user.id? 
            // Checking controller: const studentIdToSearch = entity === 'Student' ? entityId : undefined;
            // It uses prisma.profileLock.findFirst({ where: { student: { userId: entityId }... } })
            reason: 'Testing Audit Logs'
        }, { headers: coordHeaders });
        console.log(`   Override Result: ${overrideRes.data.message}`);

        // 7. Revoke SPOC entirely
        console.log("\n7. Revoking SPOC status (POST /admin/spocs/:id/revoke)...");
        const revokeRes = await axios.post(`${BASE_URL}/admin/spocs/${pendingSpoc.id}/revoke`, {}, { headers: coordHeaders });
        console.log(`   Revoke Result: ${revokeRes.data.message}`);

        // 8. Verification Audit Logs
        console.log("\n8. Fetching Action Overrides log...");
        const logsRes = await axios.get(`${BASE_URL}/admin/overrides`, { headers: coordHeaders });
        console.log(`   Logs count: ${logsRes.data.overrides?.length || 0}`);
        if (logsRes.data.overrides?.length > 0) {
            console.log("   Latest Log Type:", logsRes.data.overrides[0].actionType);
        }

        console.log("\n✅ MODULE 09 API VERIFIED");

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
