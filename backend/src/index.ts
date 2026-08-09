// Main entry point - Express server setup
import { createApp } from '@shared/middleware/app';
import { config } from '@config/env';
import { logger } from '@shared/utils/logger';
import { prisma, disconnectPrisma } from '@shared/database/prisma';

// Import route modules
import authRoutes from '@modules/auth/routes';
import billingRoutes from '@modules/billing/routes';
import productRoutes from '@modules/products/routes';
import syncRoutes from '@modules/sync/routes';
import analyticsRoutes from '@modules/analytics/routes';
import supplierRoutes from '@modules/suppliers/routes';
import customerRoutes from '@modules/customers/routes';
import receiptRoutes from '@modules/receipts/routes';
import aiRoutes from '@modules/ai/routes';
import aiForecastingRoutes from '@modules/ai/forecasting-routes';
import voiceRoutes from '@modules/voice/routes';

const app = createApp();

// Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/products', productRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/receipts', receiptRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/ai', aiForecastingRoutes);
app.use('/api/voice', voiceRoutes);

// Start server
const server = app.listen(config.port, () => {
  logger.info(`RetailPOS server running`, {
    port: config.port,
    env: config.env,
    nodeVersion: process.version,
  });
});

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received, shutting down...`);
  
  server.close(async () => {
    await disconnectPrisma();
    logger.info('Server closed');
    process.exit(0);
  });

  // Force shutdown after 30s
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason: reason instanceof Error ? reason.message : reason });
});

export { app };
