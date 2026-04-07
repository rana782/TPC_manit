const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const spocs = await prisma.user.findMany({ where: { role: 'SPOC' } });
    spocs.forEach(s => console.log(`${s.email} | Verified: ${s.isVerified} | ID: ${s.id}`));
}

main().catch(console.error).finally(() => prisma.$disconnect());
