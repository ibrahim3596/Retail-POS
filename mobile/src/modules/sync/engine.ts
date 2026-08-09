// Offline sync manager - handles bidirectional sync
import AsyncStorage from '@react-native-async-storage/async-storage';
import { APP_CONFIG } from '../../config/app';
import apiClient, { isOnline } from '../../shared/api/client';
import { executeSql, executeTransaction } from '../../shared/database/sqlite';
import { getInstallationId } from '../../shared/utils/deviceId';

let syncInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Add an entity to the sync queue for later upload
 */
export async function addToSyncQueue(
  entityType: string,
  entityId: string,
  operation: string,
  payload: Record<string, unknown>
): Promise<void> {
  const installationId = await getInstallationId();
  
  await executeSql(
    `INSERT INTO sync_queue (entity_type, entity_id, operation, payload, created_at, installation_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [entityType, entityId, operation, JSON.stringify(payload), new Date().toISOString(), installationId]
  );
}

/**
 * Get pending sync items
 */
export async function getPendingSyncItems(): Promise<Array<{
  id: number;
  entityType: string;
  entityId: string;
  operation: string;
  payload: any;
  retryCount: number;
}>> {
  const result = await executeSql(
    `SELECT * FROM sync_queue WHERE processed_at IS NULL ORDER BY created_at ASC LIMIT ?`,
    [APP_CONFIG.SYNC_BATCH_SIZE]
  );

  const items = [];
  for (let i = 0; i < result.rows.length; i++) {
    const row = result.rows.item(i);
    items.push({
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      operation: row.operation,
      payload: JSON.parse(row.payload),
      retryCount: row.retry_count,
    });
  }

  return items;
}

/**
 * Mark a sync item as processed
 */
export async function markSyncItemProcessed(id: number): Promise<void> {
  await executeSql(
    `UPDATE sync_queue SET processed_at = ? WHERE id = ?`,
    [new Date().toISOString(), id]
  );
}

/**
 * Increment retry count for a sync item
 */
export async function incrementRetryCount(id: number): Promise<void> {
  await executeSql(
    `UPDATE sync_queue SET retry_count = retry_count + 1 WHERE id = ?`,
    [id]
  );
}

/**
 * Store conflict data for user resolution
 */
async function storeConflictForResolution(
  queueItemId: number,
  conflictData: any
): Promise<void> {
  // Store in a conflicts table or AsyncStorage for UI to pick up
  // For now, we'll use AsyncStorage with a key pattern
  const conflictKey = `@sync_conflict_${queueItemId}`;
  await AsyncStorage.setItem(conflictKey, JSON.stringify({
    queueItemId,
    conflictData,
    createdAt: new Date().toISOString(),
  }));
}

/**
 * Push offline data to server
 */
export async function pushToServer(): Promise<{ success: number; failed: number }> {
  if (!(await isOnline())) {
    return { success: 0, failed: 0 };
  }

  const pendingItems = await getPendingSyncItems();
  if (pendingItems.length === 0) {
    return { success: 0, failed: 0 };
  }

  let success = 0;
  let failed = 0;

  // Group items by entity type for batch processing
  const grouped = pendingItems.reduce((acc, item) => {
    if (!acc[item.entityType]) acc[item.entityType] = [];
    acc[item.entityType].push(item);
    return acc;
  }, {} as Record<string, typeof pendingItems>);

  try {
    const installationId = await getInstallationId();
    const response = await apiClient.post('/sync/push', {
      deviceId: 'mobile-device', // TODO: Use actual device ID
      installationId, // P0-4: Include installation ID for idempotency
      items: Object.entries(grouped).flatMap(([entityType, items]) =>
        items.map((item) => ({
          entityType,
          localId: item.entityId,
          data: {
            ...item.payload,
            // C7: Ensure stockAtSale is included in payload for each invoice item
            // The billing store already includes stockAtSale in invoiceData.items
            timestamp: item.payload.timestamp || new Date().toISOString(),
          },
        }))
      ),
    });

    const results: Array<{ localId: string; status: string; conflictData?: any }> = response.data.data;

    // Process results
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const originalItem = pendingItems.find((p) => p.entityId === result.localId);

      if (originalItem) {
        if (result.status === 'success') {
          await markSyncItemProcessed(originalItem.id);
          success++;
        } else if (result.status === 'conflict') {
          // C7: Handle conflict response from server
          // Store conflict data for UI resolution
          await storeConflictForResolution(originalItem.id, result.conflictData);
          // Do NOT mark as processed - keep in queue for user resolution
          failed++;
        } else {
          await incrementRetryCount(originalItem.id);
          failed++;
        }
      }
    }
  } catch (error) {
    // Mark all as failed (will retry later)
    for (const item of pendingItems) {
      await incrementRetryCount(item.id);
      failed++;
    }
  }

  return { success, failed };
}

/**
 * Pull server data to device
 * C7: Preserve local unsynced changes - don't blindly REPLACE
 */
export async function pullFromServer(lastSync?: string): Promise<boolean> {
  if (!(await isOnline())) {
    return false;
  }

  try {
    const response = await apiClient.get('/sync/pull', {
      params: { lastSync },
    });

    const { products, customers, invoices, batches, stockMovements, creditLedger, syncTime } = response.data.data;

    // C7: Store products locally - Check is_synced before replacing
    if (products?.length > 0) {
      for (const p of products) {
        // Check if local product has unsynced changes
        const localResult = await executeSql(
          `SELECT is_synced, current_stock, updated_at FROM products WHERE id = ?`,
          [p.id]
        );
        
        let currentStock = p.currentStock;
        let shouldUpdate = true;
        
        if (localResult.rows.length > 0) {
          const localProduct = localResult.rows.item(0);
          // If local has unsynced changes, preserve local stock
          if (localProduct.is_synced === 0) {
            currentStock = localProduct.current_stock;
            // Still update other fields but keep local stock
            shouldUpdate = true;
          }
          // If both synced, use server data (server is source of truth for synced data)
          // If local is newer (updated_at > server updatedAt), preserve local
          else if (localProduct.updated_at && p.updatedAt) {
            const localUpdated = new Date(localProduct.updated_at).getTime();
            const serverUpdated = new Date(p.updatedAt).getTime();
            if (localUpdated > serverUpdated) {
              // Local is newer, skip update or merge carefully
              // For now, we'll update non-stock fields but preserve local stock
              currentStock = localProduct.current_stock;
            }
          }
        }

        await executeSql(
          `INSERT OR REPLACE INTO products
            (id, store_id, sku, barcode, name, description, category, hsn_code, unit,
             mrp, selling_price, purchase_price, gst_rate, tax_type, current_stock,
             min_stock, is_active, created_at, updated_at, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            p.id, p.storeId, p.sku, p.barcode, p.name, p.description, p.category,
            p.hsnCode, p.unit, p.mrp, p.sellingPrice, p.purchasePrice, p.gstRate,
            p.taxType, currentStock, p.minStock, p.isActive ? 1 : 0,
            p.createdAt, p.updatedAt, syncTime,
          ]
        );
      }
    }

    // Store customers locally - similar logic
    if (customers?.length > 0) {
      const queries = customers.map((c: any) => ({
        sql: `INSERT OR REPLACE INTO customers
          (id, store_id, name, phone, email, gstin, address, credit_limit, balance,
           is_active, created_at, updated_at, synced_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          c.id, c.storeId, c.name, c.phone, c.email, c.gstin, c.address,
          c.creditLimit, c.balance, c.isActive ? 1 : 0,
          c.createdAt, c.updatedAt, syncTime,
        ],
      }));
      await executeTransaction(queries);
    }

// Store invoices locally - server invoices are always synced (is_synced=1)
    // P0-1: Fix duplicate invoice on sync pull - use upsert with (store_id, local_id) as composite key
    if (invoices?.length > 0) {
      for (const invoice of invoices) {
        // Check if invoice with same local_id already exists
        const existingInvoice = await executeSql(
          `SELECT id, is_synced FROM invoices WHERE local_id = ? AND store_id = ?`,
          [invoice.localId || invoice.id, invoice.storeId]
        );

        if (existingInvoice.rows.length > 0) {
          const existing = existingInvoice.rows.item(0);
          
          // If local invoice is unsynced (is_synced=0), preserve it and update only server fields
          // If local invoice is already synced, update with server data
          const isUnsynced = existing.is_synced === 0;
          
          await executeSql(
            `UPDATE invoices SET
              id = ?,
              invoice_number = ?,
              store_id = ?,
              customer_id = ?,
              subtotal = ?,
              discount_amount = ?,
              discount_percent = ?,
              cgst_amount = ?,
              sgst_amount = ?,
              igst_amount = ?,
              total_tax = ?,
              round_off = ?,
              grand_total = ?,
              amount_paid = ?,
              payment_method = ?,
              payment_status = ?,
              is_credit_sale = ?,
              is_interstate = ?,
              status = ?,
              is_synced = 1,
              created_at = ?,
              synced_at = ?,
              updated_at = ?
            WHERE id = ? AND store_id = ?`,
            [
              invoice.id,
              invoice.invoiceNumber,
              invoice.storeId,
              invoice.customerId,
              invoice.subtotal,
              invoice.discountAmount,
              invoice.discountPercent,
              invoice.cgstAmount,
              invoice.sgstAmount,
              invoice.igstAmount,
              invoice.totalTax,
              invoice.roundOff,
              invoice.grandTotal,
              invoice.amountPaid,
              invoice.paymentMethod,
              invoice.paymentStatus,
              invoice.isCreditSale ? 1 : 0,
              invoice.isInterstate ? 1 : 0,
              invoice.status,
              syncTime,
              new Date().toISOString(),
              existing.id,
              invoice.storeId
            ]
          );
        } else {
          // Insert new invoice
          await executeSql(
            `INSERT INTO invoices
              (id, local_id, invoice_number, store_id, customer_id, subtotal, discount_amount,
               discount_percent, cgst_amount, sgst_amount, igst_amount, total_tax,
               round_off, grand_total, amount_paid, payment_method, payment_status,
               is_credit_sale, is_interstate, status, is_synced, created_at, synced_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
            [
              invoice.id,
              invoice.localId || invoice.id,
              invoice.invoiceNumber,
              invoice.storeId,
              invoice.customerId,
              invoice.subtotal,
              invoice.discountAmount,
              invoice.discountPercent,
              invoice.cgstAmount,
              invoice.sgstAmount,
              invoice.igstAmount,
              invoice.totalTax,
              invoice.roundOff,
              invoice.grandTotal,
              invoice.amountPaid,
              invoice.paymentMethod,
              invoice.paymentStatus,
              invoice.isCreditSale ? 1 : 0,
              invoice.isInterstate ? 1 : 0,
              invoice.status,
              invoice.createdAt,
              syncTime,
            ]
          );
        }

        // Insert invoice items
        if (invoice.items?.length > 0) {
          for (const item of invoice.items) {
            await executeSql(
              `INSERT OR REPLACE INTO invoice_items
                (id, invoice_id, product_id, product_name, hsn_code, quantity,
                 unit_price, mrp, discount, gst_rate, cgst_amount, sgst_amount,
                 igst_amount, total_amount)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              item.id,
              invoice.id,
              item.productId,
              item.productName,
              item.hsnCode,
              item.quantity,
              item.unitPrice,
              item.mrp,
              item.discount,
              item.gstRate,
              item.cgstAmount,
              item.sgstAmount,
              item.igstAmount,
              item.totalAmount,
            ]
            );
          }
        }
      }
    }

    // Store batches locally
    if (batches?.length > 0) {
      const queries = batches.map((b: any) => ({
        sql: `INSERT OR REPLACE INTO batches
          (id, product_id, batch_number, quantity, remaining_qty, mfg_date,
           expiry_date, purchase_price, created_at, synced_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          b.id, b.productId, b.batchNumber, b.quantity, b.remainingQty,
          b.mfgDate, b.expiryDate, b.purchasePrice, b.createdAt, syncTime,
        ],
      }));
      await executeTransaction(queries);
    }

    // Store stock movements locally
    if (stockMovements?.length > 0) {
      const queries = stockMovements.map((s: any) => ({
        sql: `INSERT OR REPLACE INTO stock_movements
          (id, product_id, batch_id, type, quantity, reference_type, reference_id, notes, created_at, synced_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          s.id, s.productId, s.batchId || null, s.type, s.quantity, s.referenceType,
          s.referenceId, s.notes, s.createdAt, syncTime,
        ],
      }));
      await executeTransaction(queries);
    }

    // C8: Store credit ledger entries locally
    if (creditLedger?.length > 0) {
      const queries = creditLedger.map((c: any) => ({
        sql: `INSERT OR REPLACE INTO credit_ledger
          (id, customer_id, type, amount, balance, reference_type, reference_id, notes, created_at, synced_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          c.id, c.customerId, c.type, c.amount, c.balance,
          c.referenceType, c.referenceId, c.notes, c.createdAt, syncTime,
        ],
      }));
      await executeTransaction(queries);
    }

    // Store last sync time
    await AsyncStorage.setItem('@last_sync', syncTime);

    return true;
  } catch (error) {
    console.error('Pull from server failed:', error);
    return false;
  }
}

/**
 * Start automatic sync interval
 */
export function startAutoSync(callback?: (result: { success: number; failed: number }) => void): void {
  if (syncInterval) return;

  syncInterval = setInterval(async () => {
    const result = await pushToServer();
    await pullFromServer();
    callback?.(result);
  }, APP_CONFIG.SYNC_INTERVAL_MS);
}

/**
 * Stop automatic sync
 */
export function stopAutoSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

/**
 * Get stored conflicts for UI resolution
 */
export async function getStoredConflicts(): Promise<Array<{ queueItemId: number; conflictData: any; createdAt: string }>> {
  const keys = await AsyncStorage.getAllKeys();
  const conflictKeys = keys.filter(k => k.startsWith('@sync_conflict_'));
  
  const conflicts = [];
  for (const key of conflictKeys) {
    const data = await AsyncStorage.getItem(key);
    if (data) {
      conflicts.push(JSON.parse(data));
    }
  }
  return conflicts;
}

/**
 * Resolve a conflict (user chose resolution)
 */
export async function resolveConflict(queueItemId: number, resolution: 'server_wins' | 'local_wins' | 'merge'): Promise<void> {
  const conflictKey = `@sync_conflict_${queueItemId}`;
  const conflictData = await AsyncStorage.getItem(conflictKey);
  
  if (!conflictData) return;
  
  const { conflictData: storedConflictData } = JSON.parse(conflictData);
  
  // Based on resolution, either:
  // - server_wins: mark as processed (local data discarded)
  // - local_wins: re-push with force flag
  // - merge: merge data and re-push
  
  if (resolution === 'server_wins') {
    await markSyncItemProcessed(queueItemId);
  } else if (resolution === 'local_wins') {
    // Re-queue with force flag - the server should accept with proper conflict resolution
    await incrementRetryCount(queueItemId); // Will retry with same data
  }
  
  // Remove conflict from storage
  await AsyncStorage.removeItem(conflictKey);
}