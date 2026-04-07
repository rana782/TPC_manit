const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const job = await prisma.job.findFirst({
        where: { companyName: 'TimelineCorp' },
        include: { postedBy: true }
    });
    console.log("Job Data:", JSON.stringify(job, null, 2));

    const spoc = await prisma.user.findUnique({
        where: { email: 'spoc_verify_07@example.com' }
    });
    console.log("SPOC Data:", JSON.stringify(spoc, null, 2));
}

check().catch(console.error).finally(() => prisma.$disconnect());
