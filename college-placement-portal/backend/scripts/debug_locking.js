const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const lock = await prisma.profileLock.findFirst({ orderBy: { lockedAt: 'desc' } });
    const placement = await prisma.placementRecord.findFirst({ orderBy: { placedAt: 'desc' } });
    console.log('Lock found:', !!lock);
    if (lock) console.log('Lock Details:', JSON.stringify(lock, null, 2));
    console.log('Placement found:', !!placement);
    if (placement) console.log('Placement Details:', JSON.stringify(placement, null, 2));
}

check().catch(console.error).finally(() => prisma.$disconnect());
