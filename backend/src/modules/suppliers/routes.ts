// Supplier API routes
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '@shared/middleware/auth';
import { createSupplier, getSuppliers, getSupplierById, updateSupplier, deleteSupplier } from './service';
import { UserRole } from '@prisma/client';

const router = Router();
router.use(authenticate);

const createSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    gstin: z.string().length(15).optional(),
    address: z.string().optional(),
  }),
});

const updateSchema = z.object({
  body: z.object({
    name: z.string().min(2).optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    gstin: z.string().length(15).optional(),
    address: z.string().optional(),
  }),
});

/**
 * POST /api/suppliers
 */
router.post('/', authorize(UserRole.OWNER, UserRole.MANAGER), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = createSchema.parse(req);
    const supplier = await createSupplier({ ...validated.body, storeId: req.user!.storeId });
    res.status(201).json({ success: true, data: supplier });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/suppliers
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = req.query.search as string | undefined;
    const suppliers = await getSuppliers(req.user!.storeId, search);
    res.json({ success: true, data: suppliers });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/suppliers/:id
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const supplier = await getSupplierById(req.params.id, req.user!.storeId);
    res.json({ success: true, data: supplier });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/suppliers/:id
 */
router.put('/:id', authorize(UserRole.OWNER, UserRole.MANAGER), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = updateSchema.parse(req);
    const supplier = await updateSupplier({ ...validated.body, id: req.params.id }, req.user!.storeId);
    res.json({ success: true, data: supplier });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/suppliers/:id
 */
router.delete('/:id', authorize(UserRole.OWNER, UserRole.MANAGER), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await deleteSupplier(req.params.id, req.user!.storeId);
    res.json({ success: true, data: { message: 'Supplier deleted' } });
  } catch (error) {
    next(error);
  }
});

export default router;
