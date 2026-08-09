// Receipt API routes
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '@shared/middleware/auth';
import { generateReceipt, formatReceiptForPrinter } from './service';

const router = Router();
router.use(authenticate);

/**
 * GET /api/receipts/:invoiceId
 * Get receipt data as JSON
 */
router.get('/:invoiceId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const receipt = await generateReceipt(req.params.invoiceId, req.user!.storeId);
    res.json({ success: true, data: receipt });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/receipts/:invoiceId/print
 * Get formatted receipt text for thermal printer
 */
router.get('/:invoiceId/print', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const receipt = await generateReceipt(req.params.invoiceId, req.user!.storeId);
    const printerText = formatReceiptForPrinter(receipt);

    res.json({ success: true, data: { text: printerText } });
  } catch (error) {
    next(error);
  }
});

export default router;
