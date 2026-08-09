// AI API routes
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '@shared/middleware/auth';
import { recognizeProduct, getProductSuggestions, batchRecognize } from './recognition';

const router = Router();
router.use(authenticate);

/**
 * POST /api/ai/recognize
 * Recognize product from image/barcode
 */
router.post('/recognize', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { imageData, barcode } = req.body;
    const result = await recognizeProduct(req.user!.storeId, imageData, barcode);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/ai/suggestions
 * Get product suggestions based on store's popular items
 */
router.get('/suggestions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit as string) || 5));
    const suggestions = await getProductSuggestions(req.user!.storeId, limit);
    res.json({ success: true, data: suggestions });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/ai/batch-recognize
 * Batch process multiple images
 */
router.post('/batch-recognize', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { images } = req.body;
    if (!images || !Array.isArray(images) || images.length === 0) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Images array required' },
      });
      return;
    }
    const results = await batchRecognize(req.user!.storeId, images);
    res.json({ success: true, data: results });
  } catch (error) {
    next(error);
  }
});

export default router;
