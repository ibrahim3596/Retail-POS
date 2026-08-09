// Analytics API routes
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '@shared/middleware/auth';
import {
  getDashboardAnalytics,
  getSalesSummary,
  getDailySales,
  getTopProducts,
  getCategorySales,
  getGrowthMetrics,
  DateRange,
} from './service';

const router = Router();
router.use(authenticate);

// Date range validation schema
const dateRangeSchema = z.object({
  query: z.object({
    startDate: z.string().datetime({ message: 'Invalid start date format' }),
    endDate: z.string().datetime({ message: 'Invalid end date format' }),
  }),
});

/**
 * GET /api/analytics/dashboard
 * Complete analytics dashboard data
 */
router.get('/dashboard', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storeId } = req.user!;
    const { startDate, endDate } = parseDateRange(req.query);

    const dashboard = await getDashboardAnalytics(storeId, { startDate, endDate });

    res.json({ success: true, data: dashboard });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/analytics/summary
 * Sales summary for a date range
 */
router.get('/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storeId } = req.user!;
    const { startDate, endDate } = parseDateRange(req.query);

    const summary = await getSalesSummary(storeId, { startDate, endDate });

    res.json({ success: true, data: summary });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/analytics/daily-sales
 * Daily sales trend
 */
router.get('/daily-sales', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storeId } = req.user!;
    const { startDate, endDate } = parseDateRange(req.query);

    const dailySales = await getDailySales(storeId, { startDate, endDate });

    res.json({ success: true, data: dailySales });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/analytics/top-products
 * Top selling products
 */
router.get('/top-products', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storeId } = req.user!;
    const { startDate, endDate } = parseDateRange(req.query);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));

    const topProducts = await getTopProducts(storeId, { startDate, endDate }, limit);

    res.json({ success: true, data: topProducts });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/analytics/category-sales
 * Sales breakdown by category
 */
router.get('/category-sales', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storeId } = req.user!;
    const { startDate, endDate } = parseDateRange(req.query);

    const categorySales = await getCategorySales(storeId, { startDate, endDate });

    res.json({ success: true, data: categorySales });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/analytics/growth
 * Period-over-period growth metrics
 */
router.get('/growth', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storeId } = req.user!;
    const { startDate, endDate } = parseDateRange(req.query);

    const growth = await getGrowthMetrics(storeId, { startDate, endDate });

    res.json({ success: true, data: growth });
  } catch (error) {
    next(error);
  }
});

/**
 * Helper to parse and validate date range from query params
 */
function parseDateRange(query: any): DateRange {
  const validated = dateRangeSchema.parse({ query });
  return {
    startDate: new Date(validated.query.startDate),
    endDate: new Date(validated.query.endDate),
  };
}

export default router;
