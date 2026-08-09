// Sync API routes
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '@shared/middleware/auth';
import { processPush, processPull } from './service';

const router = Router();
router.use(authenticate);

const pushSchema = z.object({
  body: z.object({
    deviceId: z.string().min(1),
    items: z.array(z.object({
      entityType: z.enum(['Invoice', 'Product', 'Customer']),
      localId: z.string().min(1),
      data: z.record(z.unknown()),
      timestamp: z.string(),
    })).max(100, 'Maximum 100 items per sync batch'),
  }),
});

/**
 * POST /api/sync/push
 * Push offline changes to server
 */
router.post('/push', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = pushSchema.parse(req);
    const { storeId, userId } = req.user!;

    const results = await processPush(storeId, userId, validated.body);

    res.json({ success: true, data: results });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/sync/pull?lastSync=ISO_TIMESTAMP
 * Pull server changes to device
 */
router.get('/pull', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storeId, userId } = req.user!;
    const deviceId = (req.headers['x-device-id'] as string) || 'unknown';
    const lastSync = req.query.lastSync as string | undefined;

    const data = await processPull(storeId, userId, deviceId, lastSync);

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/sync/status
 * Get sync status for the device
 */
router.get('/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storeId } = req.user!;
    const deviceId = (req.headers['x-device-id'] as string) || 'unknown';

    const pendingCount = await prisma.syncLog.count({
      where: { storeId, deviceId, status: 'PENDING' },
    });

    const lastSync = await prisma.syncLog.findFirst({
      where: { storeId, deviceId, status: 'COMPLETED' },
      orderBy: { syncedAt: 'desc' },
      select: { syncedAt: true },
    });

    res.json({
      success: true,
      data: {
        pendingCount,
        lastSyncAt: lastSync?.syncedAt || null,
      },
    });
  } catch (error) {
    next(error);
  }
});
 
/**
 * POST /api/sync/resolve
 * Resolve a sync conflict
 */
router.post('/resolve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storeId, userId } = req.user!;
    const deviceId = (req.headers['x-device-id'] as string) || 'unknown';
    const { conflictId, resolution, mergedData } = req.body;

    if (!conflictId || !resolution) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'conflictId and resolution are required' },
      });
    }

    const result = await resolveConflict(storeId, userId, deviceId, conflictId, resolution, req.body.mergedData);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

import { prisma } from '@shared/database/prisma';
import { resolveConflict } from './service';

export default router;
