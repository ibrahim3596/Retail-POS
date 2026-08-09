// Customer API routes
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '@shared/middleware/auth';
import { createCustomer, getCustomers, getCustomerWithLedger, recordPayment, getTotalOutstanding } from './service';

const router = Router();
router.use(authenticate);

/**
 * POST /api/customers
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body;
    const customer = await createCustomer({ ...body, storeId: req.user!.storeId });
    res.status(201).json({ success: true, data: customer });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/customers
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = req.query.search as string | undefined;
    const customers = await getCustomers(req.user!.storeId, search);
    res.json({ success: true, data: customers });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/customers/outstanding
 */
router.get('/outstanding', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const outstanding = await getTotalOutstanding(req.user!.storeId);
    res.json({ success: true, data: outstanding });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/customers/:id
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customer = await getCustomerWithLedger(req.params.id, req.user!.storeId);
    res.json({ success: true, data: customer });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/customers/:id/payments
 */
router.post('/:id/payments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { amount, notes } = req.body;
    const result = await recordPayment({
      customerId: req.params.id,
      storeId: req.user!.storeId,
      amount,
      notes,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

export default router;
