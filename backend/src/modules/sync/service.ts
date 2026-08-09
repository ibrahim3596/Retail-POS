// Offline sync engine - handles bidirectional data synchronization
import { prisma } from '@shared/database/prisma';
import { logger } from '@shared/utils/logger';
import { ValidationError } from '@shared/types/errors';
import { Prisma, PaymentMethod, PaymentStatus } from '@prisma/client';

export interface SyncPushItem {
  entityType: string;
  localId: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface SyncPushRequest {
  deviceId: string;
  installationId?: string;
  items: SyncPushItem[];
}

export interface SyncResult {
  entityType: string;
  localId: string;
  status: 'success' | 'conflict' | 'error';
  serverId?: string;
  error?: string;
  conflictData?: any; // Server version for conflict resolution
}

/**
 * Process offline data push from device
 * Uses upsert with conflict resolution (last-write-wins with validation)
 */
export async function processPush(
  storeId: string,
  userId: string,
  request: SyncPushRequest
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  const installationId = request.installationId || 'unknown';

  for (const item of request.items) {
    try {
      let result: SyncResult;

      switch (item.entityType) {
        case 'Invoice':
          result = await syncInvoice(storeId, userId, request.deviceId, installationId, item);
          break;
        case 'Product':
          result = await syncProduct(storeId, userId, request.deviceId, installationId, item);
          break;
        case 'Customer':
          result = await syncCustomer(storeId, userId, request.deviceId, installationId, item);
          break;
        default:
          result = {
            entityType: item.entityType,
            localId: item.localId,
            status: 'error',
            error: `Unknown entity type: ${item.entityType}`,
          };
      }

      results.push(result);
    } catch (error) {
      console.log('SYNC_ITEM_ERROR:', error instanceof Error ? error.stack || error.message : error);
      logger.error('Sync item failed', {
        entityType: item.entityType,
        localId: item.localId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      results.push({
        entityType: item.entityType,
        localId: item.localId,
        status: 'conflict',
        error: error instanceof Error ? error.message : 'Unknown error',
        conflictData: {
          reason: 'INSUFFICIENT_STOCK',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }
  }

  logger.info('Sync push complete', {
    storeId,
    deviceId: request.deviceId,
    total: request.items.length,
    success: results.filter((r) => r.status === 'success').length,
    errors: results.filter((r) => r.status === 'error' || r.status === 'conflict').length,
  });

  return results;
}

/**
   * Get conflict fields between existing and incoming data
   */
  function getConflictFields(existing: any, incoming: any): string[] {
    const conflicts: string[] = [];
    
    const fieldsToCompare = [
      'subtotal', 'discountAmount', 'discountPercent', 'roundOff',
      'cgstAmount', 'sgstAmount', 'igstAmount', 'totalTax', 'grandTotal',
      'amountPaid', 'paymentMethod', 'paymentStatus', 'isCreditSale', 'isInterstate'
    ];
    
    for (const field of fieldsToCompare) {
      if (incoming[field] === undefined) continue;
      const existingVal = existing[field];
      const incomingVal = incoming[field];
      
      const eNum = Number(existingVal);
      const iNum = Number(incomingVal);
      if (!isNaN(eNum) && !isNaN(iNum) && typeof incomingVal !== 'boolean') {
        if (Math.abs(eNum - iNum) > 0.01) {
          conflicts.push(field);
        }
      } else if (Boolean(existingVal) !== Boolean(incomingVal)) {
        conflicts.push(field);
      }
    }
    
    // Compare items
    const existingItems = existing.items || [];
    const incomingItems = incoming.items || [];
    
    if (existingItems.length !== incomingItems.length) {
      conflicts.push('items.length');
    } else {
      for (let i = 0; i < existingItems.length; i++) {
        const ei = existingItems[i];
        const ii = incomingItems[i];
        if (ei.productId !== ii.productId) conflicts.push(`items[${i}].productId`);
        if (Math.abs(Number(ei.quantity) - Number(ii.quantity)) > 0.001) conflicts.push(`items[${i}].quantity`);
        if (Math.abs(Number(ei.unitPrice) - Number(ii.unitPrice)) > 0.01) conflicts.push(`items[${i}].unitPrice`);
        if (Math.abs(Number(ei.discount || 0) - Number(ii.discount || 0)) > 0.01) conflicts.push(`items[${i}].discount`);
        if (ii.batchId && ei.batchId && ei.batchId !== ii.batchId) conflicts.push(`items[${i}].batchId`);
      }
    }
    
    return conflicts;
  }

/**
   * Sync an invoice from offline device
   */
  async function syncInvoice(
    storeId: string,
    userId: string,
    deviceId: string,
    installationId: string,
    item: SyncPushItem
  ): Promise<SyncResult> {
    const data = item.data;

  // Validate items provided
  if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
    throw new ValidationError({ items: ['At least one item is required'] });
  }

  // Create invoice and reconcile stock using atomic conditional deduction (with retry for lock contention)
  let invoice: any;
  let attempts = 0;

  while (attempts < 5) {
    // Check for existing invoice with same localId + storeId (composite unique index)
    const existing = await prisma.invoice.findFirst({
      where: { storeId, localId: item.localId },
      include: { items: true },
    });

    if (existing) {
      // Check if data differs (conflict)
      const conflictFields = getConflictFields(existing, data);
      if (conflictFields.length > 0) {
        return {
          entityType: 'Invoice',
          localId: item.localId,
          status: 'conflict',
          serverId: existing.id,
          conflictData: {
            server: existing,
            local: data,
            conflictFields,
          },
        };
      }
      await prisma.syncLog.updateMany({
        where: { storeId, localId: item.localId, direction: 'PUSH', status: 'PENDING' },
        data: { status: 'COMPLETED', entityId: existing.id, syncedAt: new Date() },
      });
      return {
        entityType: 'Invoice',
        localId: item.localId,
        status: 'success',
        serverId: existing.id,
      };
    }

    try {
      invoice = await prisma.$transaction(async (tx) => {
        // Reconcile stock BEFORE invoice creation - throws if stock/batch insufficient
        const movementsToCreate = await reconcileStock(tx, data.items as any[]);

        // Generate invoice number if not provided
        let invoiceNumber = data.invoiceNumber as string;
        if (!invoiceNumber) {
          const lastInvoice = await tx.invoice.findFirst({
            where: { storeId },
            orderBy: { createdAt: 'desc' },
            select: { invoiceNumber: true },
          });
          let nextNum = 1;
          if (lastInvoice) {
            const match = lastInvoice.invoiceNumber.match(/INV-(\d+)/);
            if (match) nextNum = parseInt(match[1], 10) + 1;
          }
          invoiceNumber = `INV-${String(nextNum).padStart(6, '0')}`;
        }

        // Create invoice server-side
        const createdInvoice = await tx.invoice.create({
          data: {
            storeId,
            userId,
            localId: item.localId,
            invoiceNumber,
            customerId: data.customerId as string | null,
            subtotal: Number(data.subtotal || 0),
            discountAmount: Number(data.discountAmount || 0),
            discountPercent: Number(data.discountPercent || 0),
            cgstAmount: Number(data.cgstAmount || 0),
            sgstAmount: Number(data.sgstAmount || 0),
            igstAmount: Number(data.igstAmount || 0),
            totalTax: Number(data.totalTax || 0),
            roundOff: Number(data.roundOff || 0),
            grandTotal: Number(data.grandTotal || 0),
            amountPaid: Number(data.amountPaid !== undefined ? data.amountPaid : data.grandTotal || 0),
            paymentMethod: (data.paymentMethod as PaymentMethod) || 'CASH',
            paymentStatus: (data.paymentStatus as PaymentStatus) || 'PAID',
            isCreditSale: Boolean(data.isCreditSale),
            isInterstate: Boolean(data.isInterstate),
            status: 'COMPLETED',
            syncedAt: new Date(),
            items: {
              create: (data.items as any[]).map((i) => ({
                productId: i.productId,
                productName: i.productName || '',
                hsnCode: i.hsnCode || null,
                quantity: Number(i.quantity || 0),
                unitPrice: Number(i.unitPrice || 0),
                mrp: Number(i.mrp || i.unitPrice || 0),
                discount: Number(i.discount || 0),
                gstRate: Number(i.gstRate || 0),
                cgstAmount: Number(i.cgstAmount || 0),
                sgstAmount: Number(i.sgstAmount || 0),
                igstAmount: Number(i.igstAmount || 0),
                totalAmount: Number(i.totalAmount || 0),
                batchId: i.batchId || (movementsToCreate.find((m) => m.productId === i.productId)?.batchId) || null,
                expiryDate: i.expiryDate ? new Date(i.expiryDate) : null,
              })),
            },
          },
          include: { items: true },
        });

        // Create OUT stock movements linked to this invoice
        for (const mov of movementsToCreate) {
          await tx.stockMovement.create({
            data: {
              productId: mov.productId,
              batchId: mov.batchId,
              type: 'OUT',
              quantity: mov.quantity,
              referenceType: 'INVOICE',
              referenceId: createdInvoice.id,
            },
          });
        }

        // Update customer balance for credit sales
        if (createdInvoice.isCreditSale && createdInvoice.customerId) {
          const outstanding = Number(createdInvoice.grandTotal) - Number(createdInvoice.amountPaid);
          await tx.customer.update({
            where: { id: createdInvoice.customerId },
            data: { balance: { increment: outstanding } },
          });

          // Calculate running balance from credit ledger entries
          const previousEntries = await tx.creditLedgerEntry.findMany({
            where: { customerId: createdInvoice.customerId },
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
              customerId: createdInvoice.customerId,
              type: 'DEBIT',
              amount: outstanding,
              balance: runningBalance,
              referenceType: 'INVOICE',
              referenceId: createdInvoice.id,
              notes: `Invoice ${createdInvoice.invoiceNumber}`,
            },
          });
        }

        return createdInvoice;
      }, {
        timeout: 10000,
      });

      break; // Success, exit retry loop
    } catch (err: any) {
      attempts++;
      if (err instanceof ValidationError || attempts >= 5) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 50 * attempts));
    }
  }

  // Record or update sync log
  const existingSyncLog = await prisma.syncLog.findFirst({
    where: { storeId, localId: item.localId, direction: 'PUSH' },
  });

  const payloadStr = typeof data === 'string' ? data : JSON.stringify(data);

  if (existingSyncLog) {
    await prisma.syncLog.update({
      where: { id: existingSyncLog.id },
      data: {
        status: 'COMPLETED',
        entityId: invoice.id,
        deviceId,
        installationId,
        syncedAt: new Date(),
      },
    });
  } else {
    await prisma.syncLog.create({
      data: {
        storeId,
        userId,
        deviceId,
        installationId,
        direction: 'PUSH',
        entityType: 'Invoice',
        entityId: invoice.id,
        localId: item.localId,
        status: 'COMPLETED',
        payload: payloadStr,
        syncedAt: new Date(),
      },
    });
  }

  return {
    entityType: 'Invoice',
    localId: item.localId,
    status: 'success',
    serverId: invoice.id,
  };
}

/**
 * Reconcile stock using Atomic Conditional Deduction & Server FEFO Allocation
 * Throws ValidationError if stock or batch quantity is insufficient
 */
async function reconcileStock(
  tx: Prisma.TransactionClient,
  items: any[]
): Promise<Array<{ productId: string; batchId: string | null; quantity: number }>> {
  const movements: Array<{ productId: string; batchId: string | null; quantity: number }> = [];

  for (const item of items) {
    const product = await tx.product.findUnique({
      where: { id: item.productId },
      include: {
        batches: {
          where: { remainingQty: { gt: 0 } },
          orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    if (!product) {
      throw new ValidationError({ product: [`Product ${item.productId} not found`] });
    }

    const qty = Number(item.quantity);
    const currentProductStock = Number(product.currentStock);

    // 1. Invariant check: currentStock >= qty
    if (currentProductStock < qty) {
      throw new ValidationError({
        stock: [`Insufficient stock for product "${product.name}". Available: ${currentProductStock}, Requested: ${qty}`],
      });
    }

    // 2. Perform ATOMIC CONDITIONAL DB update
    const updated = await tx.product.updateMany({
      where: {
        id: item.productId,
        currentStock: { gte: qty },
      },
      data: {
        currentStock: { decrement: qty },
      },
    });

    if (updated.count === 0) {
      throw new ValidationError({
        stock: [`Concurrent modification error: Insufficient stock for product "${product.name}"`],
      });
    }

    // 3. FEFO Batch Deduction (if product has active batches)
    if (product.batches.length > 0) {
      const totalBatchAvailable = product.batches.reduce(
        (sum, b) => sum + Number(b.remainingQty),
        0
      );

      // ALL-OR-NOTHING FEFO rule: if total batch stock < requested qty, ROLL BACK ENTIRE SALE
      if (totalBatchAvailable < qty) {
        throw new ValidationError({
          batch: [`Insufficient batch stock for product "${product.name}". Total available across batches: ${totalBatchAvailable}, Requested: ${qty}`],
        });
      }

      let remainingToDeduct = qty;
      for (const batch of product.batches) {
        if (remainingToDeduct <= 0) break;

        const batchAvail = Number(batch.remainingQty);
        const deductFromBatch = Math.min(remainingToDeduct, batchAvail);

        const updatedBatch = await tx.batch.updateMany({
          where: {
            id: batch.id,
            remainingQty: { gte: deductFromBatch },
          },
          data: {
            remainingQty: { decrement: deductFromBatch },
          },
        });

        if (updatedBatch.count === 0) {
          throw new ValidationError({
            batch: [`Concurrent batch update error for batch ${batch.batchNumber}`],
          });
        }

        movements.push({
          productId: item.productId,
          batchId: batch.id,
          quantity: deductFromBatch,
        });

        remainingToDeduct -= deductFromBatch;
      }
    } else {
      movements.push({
        productId: item.productId,
        batchId: item.batchId || null,
        quantity: qty,
      });
    }


  }

  return movements;
}

/**
 * Sync a product from offline device
 */
async function syncProduct(
  storeId: string,
  userId: string,
  deviceId: string,
  installationId: string,
  item: SyncPushItem
): Promise<SyncResult> {
  const data = item.data as any;

  // Check for existing product with same SKU
  const existing = await prisma.product.findFirst({
    where: { storeId, sku: data.sku },
  });

  if (existing) {
    return {
      entityType: 'Product',
      localId: item.localId,
      status: 'success',
      serverId: existing.id,
    };
  }

  const product = await prisma.product.create({
    data: {
      storeId,
      sku: data.sku,
      barcode: data.barcode,
      name: data.name,
      description: data.description,
      category: data.category,
      hsnCode: data.hsnCode,
      unit: data.unit,
      mrp: data.mrp,
      sellingPrice: data.sellingPrice,
      purchasePrice: data.purchasePrice,
      gstRate: data.gstRate,
      taxType: data.taxType,
      currentStock: 0,
      minStock: data.minStock || 0,
    },
  });

  await prisma.syncLog.create({
    data: {
      storeId,
      userId,
      deviceId,
      installationId,
      direction: 'PUSH',
      entityType: 'Product',
      entityId: product.id,
      localId: item.localId,
      status: 'COMPLETED',
      syncedAt: new Date(),
    },
  });

  return {
    entityType: 'Product',
    localId: item.localId,
    status: 'success',
    serverId: product.id,
  };
}

/**
 * Sync a customer from offline device
 */
async function syncCustomer(
  storeId: string,
  userId: string,
  deviceId: string,
  installationId: string,
  item: SyncPushItem
): Promise<SyncResult> {
  const data = item.data as any;

  const customer = await prisma.customer.create({
    data: {
      storeId,
      name: data.name,
      phone: data.phone,
      email: data.email,
      gstin: data.gstin,
      address: data.address,
      creditLimit: data.creditLimit || 0,
      balance: 0,
    },
  });

  await prisma.syncLog.create({
    data: {
      storeId,
      userId,
      deviceId,
      installationId,
      direction: 'PUSH',
      entityType: 'Customer',
      entityId: customer.id,
      localId: item.localId,
      status: 'COMPLETED',
      syncedAt: new Date(),
    },
  });

  return {
    entityType: 'Customer',
    localId: item.localId,
    status: 'success',
    serverId: customer.id,
  };
}

/**
 * Pull changes from server for a device
 * Returns all changes since last sync timestamp
 */
export async function processPull(
  storeId: string,
  userId: string,
  deviceId: string,
  lastSyncAt?: string
): Promise<{ products: any[]; customers: any[]; invoices: any[]; batches: any[]; stockMovements: any[]; creditLedger: any[]; syncTime: string }> {
  const since = lastSyncAt ? new Date(lastSyncAt) : new Date(0);

  const [products, customers, invoices, batches, stockMovements, creditLedger] = await Promise.all([
    prisma.product.findMany({
      where: { storeId, updatedAt: { gt: since } },
      orderBy: { updatedAt: 'asc' },
    }),
    prisma.customer.findMany({
      where: { storeId, updatedAt: { gt: since } },
      orderBy: { updatedAt: 'asc' },
    }),
    prisma.invoice.findMany({
      where: { storeId, createdAt: { gt: since } },
      include: { items: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.batch.findMany({
      where: { product: { storeId }, updatedAt: { gt: since } },
      orderBy: { updatedAt: 'asc' },
    }),
    prisma.stockMovement.findMany({
      where: { product: { storeId }, createdAt: { gt: since } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.creditLedgerEntry.findMany({
      where: { customer: { storeId }, createdAt: { gt: since } },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const syncTime = new Date().toISOString();

  // Record pull sync log
  await prisma.syncLog.create({
    data: {
      storeId,
      userId,
      deviceId,
      installationId: 'server', // Pull is initiated by server
      direction: 'PULL',
      entityType: 'ALL',
      entityId: 'batch',
      status: 'COMPLETED',
      syncedAt: new Date(),
    },
  });

  return { products, customers, invoices, batches, stockMovements, creditLedger, syncTime };
}

/**
 * Resolve a sync conflict
 * resolution: 'server_wins' | 'local_wins' | 'merge'
 */
export async function resolveConflict(
  storeId: string,
  userId: string,
  deviceId: string,
  conflictId: string, // syncLog id
  resolution: 'server_wins' | 'local_wins' | 'merge',
  mergedData?: any
): Promise<SyncResult> {
  const syncLog = await prisma.syncLog.findFirst({
    where: { id: conflictId, storeId },
  });

  if (!syncLog) {
    throw new ValidationError({ conflict: ['Conflict not found'] });
  }

  if (syncLog.status !== 'CONFLICT') {
    throw new ValidationError({ conflict: ['Conflict already resolved'] });
  }

  const payload = syncLog.payload as any;
  let resolvedData: any;

  switch (resolution) {
    case 'server_wins':
      resolvedData = syncLog.payload;
      break;
    case 'local_wins':
      resolvedData = payload;
      break;
    case 'merge':
      if (!mergedData) {
        throw new ValidationError({ mergedData: ['Merged data required for merge resolution'] });
      }
      resolvedData = mergedData;
      break;
    default:
      throw new ValidationError({ resolution: ['Invalid resolution type'] });
  }

  // Apply the resolved data
  const pushResults = await processPush(storeId, userId, {
    deviceId,
    installationId: syncLog.installationId,
    items: [{
      entityType: syncLog.entityType,
      localId: syncLog.localId || 'unknown',
      data: resolvedData,
      timestamp: new Date().toISOString(),
    }],
  });

  const result = pushResults[0];
  
  // Update conflict log
  await prisma.syncLog.update({
    where: { id: conflictId },
    data: {
      status: 'COMPLETED',
      payload: { ...payload, resolution, resolvedAt: new Date().toISOString() },
      syncedAt: new Date(),
    },
  });

  return result;
}
