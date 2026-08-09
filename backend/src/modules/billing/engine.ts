// Billing engine - handles invoice creation with duplicate prevention
import { prisma } from '@shared/database/prisma';
import { logger } from '@shared/utils/logger';
import { ConflictError, NotFoundError, ValidationError } from '@shared/types/errors';
import { calculateInvoiceGST, GSTItemInput } from '@modules/gst/calculator';
import { PaymentMethod, PaymentStatus, InvoiceStatus, Prisma } from '@prisma/client';

export interface CreateInvoiceInput {
  storeId: string;
  customerId?: string;
  userId: string;
  items: InvoiceItemInput[];
  paymentMethod: PaymentMethod;
  isCreditSale?: boolean;
  discountAmount?: number;
  discountPercent?: number;
  isInterstate?: boolean;
  localId?: string; // For offline sync deduplication
  amountPaid?: number;
}

export interface InvoiceItemInput {
  productId: string;
  quantity: number;
  discount?: number;
  batchId?: string;
}

export interface StockDeduction {
  productId: string;
  batchId: string;
  qty: number;
}

export interface CreatedInvoice {
  id: string;
  invoiceNumber: string;
  subtotal: number;
  discountAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTax: number;
  grandTotal: number;
  amountPaid: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    gstRate: number;
    totalAmount: number;
  }>;
}

/**
 * Generate next invoice number for a store
 * Format: INV-000001 (sequential per store)
 */
async function generateInvoiceNumber(storeId: string): Promise<string> {
  const lastInvoice = await prisma.invoice.findFirst({
    where: { storeId },
    orderBy: { createdAt: 'desc' },
    select: { invoiceNumber: true },
  });

  let nextNumber = 1;
  if (lastInvoice) {
    const match = lastInvoice.invoiceNumber.match(/INV-(\d+)/);
    if (match) {
      nextNumber = parseInt(match[1], 10) + 1;
    }
  }

  return `INV-${String(nextNumber).padStart(6, '0')}`;
}

/**
 * Create a new invoice with full validation and duplicate prevention
 * Uses database transactions for consistency
 */
export async function createInvoice(input: CreateInvoiceInput): Promise<CreatedInvoice> {
  const {
    storeId,
    customerId,
    userId,
    items,
    paymentMethod,
    isCreditSale = false,
    discountAmount = 0,
    discountPercent = 0,
    isInterstate = false,
    localId,
    amountPaid = 0,
  } = input;

  // Validate input
  if (!items || items.length === 0) {
    throw new ValidationError({ items: ['At least one item is required'] });
  }

  // Check for duplicate (offline sync deduplication)
  if (localId) {
    const existing = await prisma.invoice.findFirst({
      where: { localId },
      select: { id: true, invoiceNumber: true },
    });
    if (existing) {
      logger.info('Duplicate invoice detected, returning existing', {
        localId,
        invoiceNumber: existing.invoiceNumber,
      });
      throw new ConflictError(`Invoice already exists with number ${existing.invoiceNumber}`);
    }
  }

  // Fetch all products in a single query
  const productIds = items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, storeId, isActive: true },
    include: {
      batches: {
        where: { remainingQty: { gt: 0 } },
        orderBy: { expiryDate: 'asc' }, // FEFO - First Expiry First Out
      },
    },
  });

  const productMap = new Map(products.map((p) => [p.id, p]));

  // Validate all products exist and have sufficient stock
  const validatedItems: GSTItemInput[] = [];
  const stockDeductions: StockDeduction[] = [];

  for (const item of items) {
    const product = productMap.get(item.productId);

    if (!product) {
      throw new NotFoundError('Product', item.productId);
    }

    if (item.quantity <= 0) {
      throw new ValidationError({
        [`quantity_${item.productId}`]: ['Quantity must be greater than 0'],
      });
    }

    // Check stock availability
    if (Number(product.currentStock) < item.quantity) {
      throw new ValidationError({
        stock: [`Insufficient stock for "${product.name}". Available: ${product.currentStock}, Requested: ${item.quantity}`],
      });
    }

    // Determine batches using FEFO (First Expiry First Out)
    // If batchId is specified, validate it exists and has enough stock
    // Otherwise, allocate across batches using FEFO
    let remainingToDeduct = item.quantity;

    if (item.batchId) {
      // Validate specific batch
      const batch = product.batches.find(b => b.id === item.batchId);
      if (!batch || Number(batch.remainingQty) < item.quantity) {
        throw new ValidationError({
          stock: [`Insufficient stock in specified batch for "${product.name}"`],
        });
      }
      stockDeductions.push({
        productId: product.id,
        batchId: item.batchId,
        qty: item.quantity,
      });
    } else {
      // Auto-allocate using FEFO across batches
      for (const batch of product.batches) {
        if (remainingToDeduct <= 0) break;
        if (Number(batch.remainingQty) <= 0) continue;

        const deductQty = Math.min(remainingToDeduct, Number(batch.remainingQty));
        stockDeductions.push({
          productId: product.id,
          batchId: batch.id,
          qty: deductQty,
        });
        remainingToDeduct -= deductQty;
      }

      if (remainingToDeduct > 0) {
        throw new ValidationError({
          stock: [`Insufficient stock across batches for "${product.name}". Available: ${product.currentStock}, Requested: ${item.quantity}`],
        });
      }
    }

    validatedItems.push({
      productId: product.id,
      productName: product.name,
      hsnCode: product.hsnCode,
      quantity: item.quantity,
      unitPrice: Number(product.sellingPrice),
      mrp: Number(product.mrp),
      discount: item.discount || 0,
      gstRate: Number(product.gstRate),
      taxType: product.taxType as 'GST' | 'EXEMPT' | 'NIL',
    });
  }

  // Calculate GST
  const gstSummary = calculateInvoiceGST(
    validatedItems,
    isInterstate,
    discountAmount,
    discountPercent
  );

  // Determine payment status
  let paymentStatus: PaymentStatus;
  if (isCreditSale) {
    paymentStatus = amountPaid > 0 ? PaymentStatus.PARTIAL : PaymentStatus.PENDING;
  } else {
    paymentStatus = PaymentStatus.PAID;
  }

  // Create invoice in a transaction
  const invoice = await prisma.$transaction(async (tx) => {
    // Generate invoice number
    const invoiceNumber = await generateInvoiceNumber(storeId);

    // Map first batch per product for invoice items (since items can span multiple batches)
    const firstBatchPerProduct = new Map<string, string>();
    for (const deduction of stockDeductions) {
      if (!firstBatchPerProduct.has(deduction.productId)) {
        firstBatchPerProduct.set(deduction.productId, deduction.batchId);
      }
    }

    // Create invoice with items
    const newInvoice = await tx.invoice.create({
      data: {
        invoiceNumber,
        storeId,
        customerId,
        userId,
        subtotal: gstSummary.subtotal,
        discountAmount: gstSummary.totalDiscount,
        discountPercent,
        cgstAmount: gstSummary.totalCgst,
        sgstAmount: gstSummary.totalSgst,
        igstAmount: gstSummary.totalIgst,
        totalTax: gstSummary.totalTax,
        roundOff: gstSummary.roundOff,
        grandTotal: gstSummary.roundedGrandTotal,
        amountPaid: isCreditSale ? amountPaid : gstSummary.roundedGrandTotal,
        paymentMethod,
        paymentStatus,
        isCreditSale,
        isInterstate,
        localId,
        status: InvoiceStatus.COMPLETED,
        syncedAt: localId ? new Date() : null,
        items: {
          create: gstSummary.items.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            hsnCode: item.hsnCode,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            mrp: item.mrp,
            discount: item.discount,
            gstRate: item.gstRate,
            cgstAmount: item.cgstAmount,
            sgstAmount: item.sgstAmount,
            igstAmount: item.igstAmount,
            totalAmount: item.totalAmount,
            batchId: firstBatchPerProduct.get(item.productId) || null,
          })),
        },
      },
      include: { items: true },
    });

    // Update product stock
    for (const deduction of stockDeductions) {
      await tx.product.update({
        where: { id: deduction.productId },
        data: { currentStock: { decrement: deduction.qty } },
      });

      // Update batch remaining quantity
      await tx.batch.update({
        where: { id: deduction.batchId },
        data: { remainingQty: { decrement: deduction.qty } },
      });

      // Record stock movement
      await tx.stockMovement.create({
        data: {
          productId: deduction.productId,
          batchId: deduction.batchId,
          type: 'OUT',
          quantity: deduction.qty,
          referenceType: 'INVOICE',
          referenceId: newInvoice.id,
        },
      });
    }

    // Update customer balance for credit sales
    if (isCreditSale && customerId) {
      const outstanding = gstSummary.roundedGrandTotal - amountPaid;
      await tx.customer.update({
        where: { id: customerId },
        data: { balance: { increment: outstanding } },
      });

      // Calculate running balance from credit ledger entries
      const previousEntries = await tx.creditLedgerEntry.findMany({
        where: { customerId },
        orderBy: { createdAt: 'asc' },
      });
      let runningBalance = 0;
      for (const entry of previousEntries) {
        if (entry.type === 'DEBIT') runningBalance += Number(entry.amount);
        else runningBalance -= Number(entry.amount);
      }
      runningBalance += outstanding;

      await tx.creditLedgerEntry.create({
        data: {
          customerId,
          type: 'DEBIT',
          amount: outstanding,
          balance: runningBalance,
          referenceType: 'INVOICE',
          referenceId: newInvoice.id,
          notes: `Invoice ${invoiceNumber}`,
        },
      });
    }

    return newInvoice;
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable, // Prevent concurrent stock issues
    timeout: 10000,
  });

  logger.info('Invoice created', {
    invoiceNumber: invoice.invoiceNumber,
    storeId,
    grandTotal: invoice.grandTotal,
    itemCount: items.length,
  });

  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    subtotal: Number(invoice.subtotal),
    discountAmount: Number(invoice.discountAmount),
    cgstAmount: Number(invoice.cgstAmount),
    sgstAmount: Number(invoice.sgstAmount),
    igstAmount: Number(invoice.igstAmount),
    totalTax: Number(invoice.totalTax),
    grandTotal: Number(invoice.grandTotal),
    amountPaid: Number(invoice.amountPaid),
    paymentMethod: invoice.paymentMethod,
    paymentStatus: invoice.paymentStatus,
    items: invoice.items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      gstRate: Number(item.gstRate),
      totalAmount: Number(item.totalAmount),
    })),
  };
}
