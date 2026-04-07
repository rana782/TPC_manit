const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const allUsers = await prisma.user.findMany({ select: { email: true, role: true, isVerified: true } });
    console.log('All Users:', JSON.stringify(allUsers, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
