// Products API routes
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '@shared/middleware/auth';
import { createProduct, findProductByBarcode, searchProductsPrioritized, adjustStock, getLowStockProducts, getExpiringProducts } from './service';
import { UserRole } from '@prisma/client';

const router = Router();
router.use(authenticate);

const createProductSchema = z.object({
  body: z.object({
    sku: z.string().min(1),
    barcode: z.string().optional(),
    name: z.string().min(1),
    description: z.string().optional(),
    category: z.string().optional(),
    hsnCode: z.string().optional(),
    unit: z.string().optional(),
    mrp: z.number().positive(),
    sellingPrice: z.number().positive(),
    purchasePrice: z.number().positive(),
    gstRate: z.number().min(0).max(100).optional(),
    taxType: z.enum(['GST', 'EXEMPT', 'NIL']).optional(),
    currentStock: z.number().min(0).optional(),
    minStock: z.number().min(0).optional(),
    maxStock: z.number().min(0).optional(),
  }),
});

/**
 * POST /api/products
 */
router.post('/', authorize(UserRole.OWNER, UserRole.MANAGER), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = createProductSchema.parse(req);
    const product = await createProduct({ ...validated.body, storeId: req.user!.storeId });
    res.status(201).json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/products
 * List products with search and filters
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storeId } = req.user!;
    const search = req.query.search as string | undefined;
    const category = req.query.category as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

    const where: any = { storeId, isActive: true };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (category) where.category = category;

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.product.count({ where }),
    ]);

    res.json({
      success: true,
      data: products,
      meta: { page, limit, total, hasMore: page * limit < total },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/products/barcode/:barcode
 */
router.get('/barcode/:barcode', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const product = await findProductByBarcode(req.user!.storeId, req.params.barcode);
    res.json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/products/search
 * Prioritized search endpoint
 */
router.get('/search', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = (req.query.q as string) || '';
    const products = await searchProductsPrioritized(req.user!.storeId, query);
    res.json({ success: true, data: products });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/products/low-stock
 */
router.get('/low-stock', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const products = await getLowStockProducts(req.user!.storeId);
    res.json({ success: true, data: products });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/products/expiring
 */
router.get('/expiring', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const daysAhead = parseInt(req.query.days as string) || 30;
    const batches = await getExpiringProducts(req.user!.storeId, daysAhead);
    res.json({ success: true, data: batches });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/products/:id/stock-adjustment
 */
router.post('/:id/stock-adjustment', authorize(UserRole.OWNER, UserRole.MANAGER), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { type, quantity, notes } = req.body;
    const product = await adjustStock(req.params.id, req.user!.storeId, quantity, type, notes);
    res.json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
});

import { providerRouter } from './providers/router';

/**
 * POST /api/products/identify
 * Identification endpoint for GTIN lookup across local store, global catalog, and external providers.
 * SECURITY: storeId is derived EXCLUSIVELY from authenticated req.user.storeId (prevents IDOR attacks).
 */
router.post('/identify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.user!.storeId; // Enforce authenticated tenant boundary
    const barcode = req.body.barcode || req.body.gtin;

    if (!barcode || typeof barcode !== 'string' || !barcode.trim()) {
      return res.status(400).json({ success: false, error: 'Barcode parameter is required' });
    }

    const trimmed = barcode.trim();

    // 1. Local Store Product Check
    try {
      const localProduct = await findProductByBarcode(storeId, trimmed);
      return res.json({
        success: true,
        data: {
          status: 'FOUND_LOCAL',
          source: 'LOCAL_STORE',
          product: localProduct,
          requiresReview: false,
        },
      });
    } catch {
      // Local miss - proceed to global catalog and external provider router
    }

    // 2. Provider Router Cascade (Global Catalog -> Cache -> External Providers)
    const result = await providerRouter.identifyProductByBarcode(storeId, trimmed);

    if (result.status === 'FOUND' && result.candidate) {
      return res.json({
        success: true,
        data: {
          status: 'IDENTIFIED',
          source: result.source,
          candidate: result.candidate,
          requiresReview: true, // Commercial pricing & GST require shopkeeper confirmation
        },
      });
    }

    return res.json({
      success: true,
      data: {
        status: 'NOT_FOUND',
        source: result.source,
        candidate: null,
        requiresReview: false,
      },
    });
  } catch (error) {
    next(error);
  }
});

import { prisma } from '@shared/database/prisma';

export default router;
