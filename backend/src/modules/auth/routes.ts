// Auth API routes
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { register, login, refreshToken, logout } from './service';
import { authenticate } from '@shared/middleware/auth';

const router = Router();

const registerSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    name: z.string().min(2, 'Name must be at least 2 characters'),
    phone: z.string().optional(),
    storeName: z.string().min(2, 'Store name must be at least 2 characters'),
    gstin: z.string().length(15, 'GSTIN must be 15 characters').optional(),
  }),
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }),
});

const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1),
  }),
});

/**
 * POST /api/auth/register
 */
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = registerSchema.parse(req);
    const result = await register(validated.body);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/login
 */
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = loginSchema.parse(req);
    const deviceInfo = req.headers['x-device-id'] as string | undefined;
    const result = await login(validated.body.email, validated.body.password, deviceInfo);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/refresh
 */
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = refreshSchema.parse(req);
    const tokens = await refreshToken(validated.body.refreshToken);
    res.json({ success: true, data: tokens });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await logout(refreshToken);
    }
    res.json({ success: true, data: { message: 'Logged out successfully' } });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/me
 */
router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.user!;
    res.json({
      success: true,
      data: {
        userId,
        email: req.user!.email,
        name: req.user!.name,
        role: req.user!.role,
        storeId: req.user!.storeId,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
