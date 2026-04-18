import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __tpcPrisma: PrismaClient | undefined;
}

const prisma = global.__tpcPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.__tpcPrisma = prisma;
}

export default prisma;