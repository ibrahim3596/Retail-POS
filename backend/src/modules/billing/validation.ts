// Validation schemas for billing
import { z } from 'zod';
import { PaymentMethod } from '@prisma/client';

export const createInvoiceSchema = z.object({
  body: z.object({
    customerId: z.string().uuid().optional(),
    items: z.array(z.object({
      productId: z.string().uuid(),
      quantity: z.number().positive(),
      discount: z.number().min(0).optional(),
      batchId: z.string().uuid().optional(),
    })).min(1, 'At least one item is required'),
    paymentMethod: z.nativeEnum(PaymentMethod),
    isCreditSale: z.boolean().optional(),
    discountAmount: z.number().min(0).optional(),
    discountPercent: z.number().min(0).max(100).optional(),
    isInterstate: z.boolean().optional(),
    localId: z.string().optional(),
    amountPaid: z.number().min(0).optional(),
  }),
});

export type CreateInvoiceBody = z.infer<typeof createInvoiceSchema>['body'];
