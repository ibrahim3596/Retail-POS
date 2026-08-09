// Billing API routes
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '@shared/middleware/auth';
import { createInvoiceSchema } from './validation';
import { createInvoice } from './engine';
import { UserRole } from '@prisma/client';

const router = Router();

// All billing routes require authentication
router.use(authenticate);

/**
 * POST /api/billing/invoices
 * Create a new invoice
 */
router.post('/invoices', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = createInvoiceSchema.parse(req);
    const { storeId, userId } = req.user!;

    const invoice = await createInvoice({
      ...validated.body,
      storeId,
      userId,
    });

    res.status(201).json({ success: true, data: invoice });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/billing/invoices
 * List invoices for the store (paginated)
 */
router.get('/invoices', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storeId } = req.user!;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where: { storeId },
        include: {
          items: true,
          customer: { select: { name: true, phone: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.invoice.count({ where: { storeId } }),
    ]);

    res.json({
      success: true,
      data: invoices,
      meta: {
        page,
        limit,
        total,
        hasMore: page * limit < total,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/billing/invoices/:id
 * Get a single invoice by ID
 */
router.get('/invoices/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storeId } = req.user!;
    const { id } = req.params;

    const invoice = await prisma.invoice.findFirst({
      where: { id, storeId },
      include: {
        items: true,
        customer: true,
      },
    });

    if (!invoice) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Invoice not found' },
      });
      return;
    }

    res.json({ success: true, data: invoice });
  } catch (error) {
    next(error);
  }
});

import { prisma } from '@shared/database/prisma';

export default router;
