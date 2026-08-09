// Express app configuration with security middleware
import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { config } from '@config/env';
import { logger, logStream } from '@shared/utils/logger';
import { AppError, ApiResponse } from '@shared/types/errors';
import { ZodError } from 'zod';

export function createApp(): Application {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors({
    origin: config.cors.origin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-ID'],
  }));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many requests' } },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/', limiter);

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Compression
  app.use(compression());

  // HTTP request logging
  app.use(morgan('combined', { stream: logStream }));

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // 404 handler
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    next(new AppError('Route not found', 404, 'NOT_FOUND'));
  });

  // Global error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    // Log the error
    logger.error('Request error', {
      error: err.message,
      stack: err.stack,
      name: err.name,
    });

    // Handle Zod validation errors
    if (err instanceof ZodError) {
      const details: Record<string, string[]> = {};
      err.errors.forEach((e) => {
        const path = e.path.join('.');
        if (!details[path]) details[path] = [];
        details[path].push(e.message);
      });
      const response: ApiResponse = {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details },
      };
      res.status(422).json(response);
      return;
    }

    // Handle known application errors
    if (err instanceof AppError) {
      const response: ApiResponse = {
        success: false,
        error: { code: err.code, message: err.message, details: err.details },
      };
      res.status(err.statusCode).json(response);
      return;
    }

    // Unknown errors - don't leak details in production
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: config.env === 'production' ? 'An unexpected error occurred' : err.message,
      },
    };
    res.status(500).json(response);
  });

  return app;
}
