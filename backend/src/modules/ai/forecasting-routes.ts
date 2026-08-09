// AI Forecasting API routes
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '@shared/middleware/auth';
import { generateDemandForecast, getReorderRecommendations } from './forecasting';

const router = Router();
router.use(authenticate);

/**
 * GET /api/ai/forecast
 * Generate demand forecast for the store
 */
router.get('/forecast', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const days = Math.min(90, Math.max(7, parseInt(req.query.days as string) || 30));
    const forecast = await generateDemandForecast(req.user!.storeId, days);
    res.json({ success: true, data: forecast });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/ai/reorder-recommendations
 * Get product reorder recommendations
 */
router.get('/reorder-recommendations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const recommendations = await getReorderRecommendations(req.user!.storeId);
    res.json({ success: true, data: recommendations });
  } catch (error) {
    next(error);
  }
});

export default router;
