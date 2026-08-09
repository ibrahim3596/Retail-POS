// Product & Inventory management service
import { prisma } from '@shared/database/prisma';
import { logger } from '@shared/utils/logger';
import { NotFoundError, ConflictError, ValidationError } from '@shared/types/errors';

export interface CreateProductInput {
  storeId: string;
  sku: string;
  barcode?: string;
  name: string;
  description?: string;
  category?: string;
  hsnCode?: string;
  unit?: string;
  mrp: number;
  sellingPrice: number;
  purchasePrice: number;
  gstRate?: number;
  taxType?: 'GST' | 'EXEMPT' | 'NIL';
  currentStock?: number;
  minStock?: number;
  maxStock?: number;
}

export interface UpdateProductInput extends Partial<CreateProductInput> {
  id: string;
}

/**
 * Create a new product
 */
export async function createProduct(input: CreateProductInput) {
  // Validate pricing
  if (input.sellingPrice < 0 || input.mrp < 0 || input.purchasePrice < 0) {
    throw new ValidationError({ price: ['Prices cannot be negative'] });
  }

  if (input.sellingPrice > input.mrp) {
    throw new ValidationError({ sellingPrice: ['Selling price cannot exceed MRP'] });
  }

  // Check for duplicate SKU
  const existingSku = await prisma.product.findFirst({
    where: { storeId: input.storeId, sku: input.sku },
  });
  if (existingSku) {
    throw new ConflictError(`Product with SKU '${input.sku}' already exists`);
  }

  // Check for duplicate barcode
  if (input.barcode) {
    const existingBarcode = await prisma.product.findFirst({
      where: { storeId: input.storeId, barcode: input.barcode },
    });
    if (existingBarcode) {
      throw new ConflictError(`Product with barcode '${input.barcode}' already exists`);
    }
  }

  const product = await prisma.product.create({
    data: {
      storeId: input.storeId,
      sku: input.sku,
      barcode: input.barcode,
      name: input.name,
      description: input.description,
      category: input.category,
      hsnCode: input.hsnCode,
      unit: input.unit || 'PCS',
      mrp: input.mrp,
      sellingPrice: input.sellingPrice,
      purchasePrice: input.purchasePrice,
      gstRate: input.gstRate ?? 18,
      taxType: input.taxType ?? 'GST',
      currentStock: input.currentStock ?? 0,
      minStock: input.minStock ?? 0,
      maxStock: input.maxStock ?? 0,
    },
  });

  // Record initial stock movement if stock > 0
  if (input.currentStock && input.currentStock > 0) {
    await prisma.stockMovement.create({
      data: {
        productId: product.id,
        type: 'IN',
        quantity: input.currentStock,
        referenceType: 'ADJUSTMENT',
        notes: 'Initial stock',
      },
    });
  }

  logger.info('Product created', { productId: product.id, sku: input.sku, storeId: input.storeId });
  return product;
}

/**
 * Find product by barcode
 */
export async function findProductByBarcode(storeId: string, barcode: string) {
  const product = await prisma.product.findFirst({
    where: { storeId, barcode, isActive: true },
    include: {
      batches: {
        where: { remainingQty: { gt: 0 } },
        orderBy: { expiryDate: 'asc' },
      },
    },
  });

  if (!product) {
    throw new NotFoundError('Product', barcode);
  }

  return product;
}

/**
 * Update product stock (for inventory adjustments)
 */
export async function adjustStock(
  productId: string,
  storeId: string,
  quantity: number,
  type: 'IN' | 'OUT' | 'ADJUSTMENT',
  notes?: string
) {
  const product = await prisma.product.findFirst({
    where: { id: productId, storeId },
  });

  if (!product) {
    throw new NotFoundError('Product', productId);
  }

  if (type === 'OUT' && product.currentStock < quantity) {
    throw new ValidationError({ stock: [`Insufficient stock. Available: ${product.currentStock}`] });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updated = await tx.product.update({
      where: { id: productId },
      data: {
        currentStock: type === 'IN'
          ? { increment: quantity }
          : type === 'OUT'
          ? { decrement: quantity }
          : quantity,
      },
    });

    await tx.stockMovement.create({
      data: {
        productId,
        type,
        quantity,
        referenceType: type === 'ADJUSTMENT' ? 'ADJUSTMENT' : undefined,
        notes,
      },
    });

    return updated;
  });

  logger.info('Stock adjusted', { productId, type, quantity, newStock: updated.currentStock });
  return updated;
}

/**
 * Get low stock alerts
 */
export async function getLowStockProducts(storeId: string) {
  const products = await prisma.product.findMany({
    where: {
      storeId,
      isActive: true,
      minStock: { gt: 0 },
      currentStock: { lte: prisma.product.fields.minStock },
    },
    orderBy: { currentStock: 'asc' },
  });

  return products;
}

/**
 * Get products nearing expiry
 */
export async function getExpiringProducts(storeId: string, daysAhead: number = 30) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + daysAhead);

  const batches = await prisma.batch.findMany({
    where: {
      expiryDate: { lte: futureDate, gt: new Date() },
      remainingQty: { gt: 0 },
      product: { storeId },
    },
    include: { product: { select: { name: true, sku: true } } },
    orderBy: { expiryDate: 'asc' },
  });

  return batches;
}
