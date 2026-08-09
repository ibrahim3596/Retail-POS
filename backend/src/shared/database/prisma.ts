// Prisma client singleton with connection pooling and logging
import { PrismaClient } from '@prisma/client';
import { config } from '@config/env';
import { logger } from '@shared/utils/logger';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: config.env === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (config.env !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Graceful shutdown helper
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
  logger.info('Prisma disconnected');
}
