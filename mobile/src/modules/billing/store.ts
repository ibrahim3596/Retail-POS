// Billing/POS state management with Zustand
import { create } from 'zustand';
import { APP_CONFIG } from '../../config/app';
import { executeSql, addToSyncQueue } from '../../shared/database/sqlite';
import apiClient from '../../shared/api/client';
import { v4 as uuid } from 'uuid';
import { calculateInvoiceGST, GSTItemInput, GSTSummary } from '../../shared/utils/gstCalculator';

export interface CartItem {
  productId: string;
  productName: string;
  barcode?: string;
  quantity: number;
  unitPrice: number;
  mrp: number;
  discount: number;
  gstRate: number;
  taxType: string;
  availableStock: number;
  batchId?: string; // For batch-tracked products
  hasBatches?: boolean; // Whether product has batches
}

interface BillingState {
  cart: CartItem[];
  customerId?: string;
  customerName?: string;
  isProcessing: boolean;
  error: string | null;

  // C4: Retry idempotency - track pending localId per cart session
  pendingLocalId: string | null;

  // Actions
  addToCart: (item: CartItem) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  updateDiscount: (productId: string, discount: number) => void;
  clearCart: () => void;
  setCustomer: (id: string | undefined, name: string | undefined) => void;
  getSubtotal: () => number;
  getTotalDiscount: () => number;
  getTotalTax: () => number;
  getGrandTotal: () => number;
  getGSTSummary: () => GSTSummary;
  processSale: (paymentMethod: string, isCreditSale?: boolean, amountPaid?: number) => Promise<{ success: boolean; invoiceNumber?: string }>;
  clearError: () => void;
  
  // C4: Start new sale session (generates new localId)
  startNewSale: () => void;
}

export const useBillingStore = create<BillingState>((set, get) => ({
  cart: [],
  customerId: undefined,
  customerName: undefined,
  isProcessing: false,
  error: null,
  pendingLocalId: null,

  addToCart: (item: CartItem) => {
    const cart = get().cart;
    const existing = cart.find((i) => i.productId === item.productId);

    if (existing) {
      // Update quantity if already in cart
      const newQuantity = existing.quantity + item.quantity;
      if (newQuantity > item.availableStock) {
        set({ error: `Insufficient stock. Available: ${item.availableStock}` });
        return;
      }
      set({
        cart: cart.map((i) =>
          i.productId === item.productId ? { ...i, quantity: newQuantity } : i
        ),
      });
    } else {
      set({ cart: [...cart, item], error: null });
    }
  },

  removeFromCart: (productId: string) => {
    set({ cart: get().cart.filter((i) => i.productId !== productId) });
  },

  updateQuantity: (productId: string, quantity: number) => {
    if (quantity <= 0) {
      get().removeFromCart(productId);
      return;
    }

    const item = get().cart.find((i) => i.productId === productId);
    if (item && quantity > item.availableStock) {
      set({ error: `Insufficient stock. Available: ${item.availableStock}` });
      return;
    }

    set({
      cart: get().cart.map((i) =>
        i.productId === productId ? { ...i, quantity } : i
      ),
      error: null,
    });
  },

  updateDiscount: (productId: string, discount: number) => {
    set({
      cart: get().cart.map((i) =>
        i.productId === productId ? { ...i, discount } : i
      ),
    });
  },

  clearCart: () => {
    set({ cart: [], customerId: undefined, customerName: undefined, error: null, pendingLocalId: null });
  },

  setCustomer: (id: string | undefined, name: string | undefined) => {
    set({ customerId: id, customerName: name });
  },

  getSubtotal: () => {
    return get().cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  },

  getTotalDiscount: () => {
    return get().cart.reduce((sum, item) => sum + item.discount, 0);
  },

  getTotalTax: () => {
    return get().cart.reduce((sum, item) => {
      const taxableValue = item.unitPrice * item.quantity - item.discount;
      return sum + taxableValue * (item.gstRate / 100);
    }, 0);
  },

  getGrandTotal: () => {
    const state = get();
    const gstSummary = state.getGSTSummary();
    return gstSummary.roundedGrandTotal;
  },

  getGSTSummary: (): GSTSummary => {
    const state = get();
    const items: GSTItemInput[] = state.cart.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      hsnCode: null,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      mrp: item.mrp,
      discount: item.discount,
      gstRate: item.gstRate,
      taxType: item.taxType as 'GST' | 'EXEMPT' | 'NIL',
    }));
    return calculateInvoiceGST(items, false, 0, 0);
  },

  // C4: Start a new sale session - generates a new localId
  startNewSale: () => {
    const newLocalId = uuid();
    set({ pendingLocalId: newLocalId });
  },

  processSale: async (paymentMethod: string, isCreditSale = false, amountPaid = 0) => {
    const state = get();
    if (state.cart.length === 0) {
      set({ error: 'Cart is empty' });
      return { success: false };
    }

    set({ isProcessing: true, error: null });

    // C4: Use existing pendingLocalId or generate new one (retry idempotency)
    const localId = state.pendingLocalId || uuid();
    if (!state.pendingLocalId) {
      set({ pendingLocalId: localId });
    }

    const gstSummary = state.getGSTSummary();

// C1: Capture stockAtSale BEFORE any local deduction
    // This is the authoritative stock at time of sale for server reconciliation
    const stockAtSaleMap = new Map<string, number>();

    // Pre-fetch current stock and batch info for all cart items
    for (const item of state.cart) {
      // Get product current stock
      const productResult = await executeSql(
        `SELECT current_stock FROM products WHERE id = ?`,
        [item.productId]
      );
      const productStock = productResult.rows.length > 0
        ? productResult.rows.item(0).current_stock
        : 0;
      stockAtSaleMap.set(item.productId, productStock);
    }

    const invoiceData = {
      localId,
      customerId: state.customerId,
      items: state.cart.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        hsnCode: null,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        mrp: item.mrp,
        discount: item.discount || 0,
        gstRate: item.gstRate,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0,
        totalAmount: 0,
        // C1: Include stockAtSale in each item for server reconciliation
        stockAtSale: stockAtSaleMap.get(item.productId) || 0,
      })),
      paymentMethod,
      isCreditSale,
      amountPaid,
      isInterstate: false,
      timestamp: new Date().toISOString(),
      // C1: Include round_off in invoice data
      roundOff: gstSummary.roundOff,
    };

    // Map cart items to GST summary items for invoice data
    const gstItemsMap = new Map(gstSummary.items.map(item => [item.productId, item]));
    invoiceData.items = state.cart.map((item) => {
      const gstItem = gstItemsMap.get(item.productId);
      return {
        productId: item.productId,
        productName: item.productName,
        hsnCode: null,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        mrp: item.mrp,
        discount: item.discount || 0,
        gstRate: item.gstRate,
        cgstAmount: gstItem?.cgstAmount || 0,
        sgstAmount: gstItem?.sgstAmount || 0,
        igstAmount: gstItem?.igstAmount || 0,
        totalAmount: gstItem?.totalAmount || 0,
        stockAtSale: stockAtSaleMap.get(item.productId) || 0,
      };
    });

    try {
      // Try to create invoice online
      const response = await apiClient.post('/billing/invoices', invoiceData);
      const invoice = response.data.data;

      // Clear cart on success
      get().clearCart();
      set({ isProcessing: false });
      return { success: true, invoiceNumber: invoice.invoiceNumber };
    } catch (error: any) {
      // If offline, save to local DB and sync queue
      if (!error.response && error.message === 'Network Error') {
        // Use transaction for atomicity (C3: addToSyncQueue INSIDE transaction)
        await executeSql('BEGIN TRANSACTION');

        try {
          // Save invoice locally - C1: Include round_off
          await executeSql(
            `INSERT INTO invoices (id, local_id, customer_id, subtotal, discount_amount,
              cgst_amount, sgst_amount, igst_amount, total_tax, round_off, grand_total,
              amount_paid, payment_method, payment_status, is_credit_sale, is_synced, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
            [
              localId,
              localId,
              state.customerId,
              gstSummary.subtotal,
              gstSummary.totalDiscount,
              gstSummary.totalCgst,
              gstSummary.totalSgst,
              gstSummary.totalIgst,
              gstSummary.totalTax,
              gstSummary.roundOff, // C1: Save round_off
              gstSummary.roundedGrandTotal,
              isCreditSale ? amountPaid : gstSummary.roundedGrandTotal,
              paymentMethod,
              isCreditSale ? 'PENDING' : 'PAID',
              isCreditSale ? 1 : 0,
              new Date().toISOString(),
            ]
          );

          // Save invoice items
          for (const item of state.cart) {
            const gstItem = gstItemsMap.get(item.productId);
            if (!gstItem) continue;

            await executeSql(
              `INSERT INTO invoice_items (id, invoice_id, product_id, product_name, hsn_code,
                quantity, unit_price, mrp, discount, gst_rate,
                cgst_amount, sgst_amount, igst_amount, total_amount)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                uuid(),
                localId,
                item.productId,
                item.productName,
                null, // hsn_code - will be filled from product
                item.quantity,
                item.unitPrice,
                item.mrp,
                item.discount || 0,
                item.gstRate,
                gstItem.cgstAmount,
                gstItem.sgstAmount,
                gstItem.igstAmount,
                gstItem.totalAmount,
              ]
            );
          }

          // C2 & C6: Deduct stock and record stock movements with FEFO batch support
          for (const item of state.cart) {
            const itemQuantity = item.quantity;
            let remainingQty = itemQuantity;
            const productStockAtSale = stockAtSaleMap.get(item.productId) || 0;

            // If product has batch tracking, use FEFO (First Expired, First Out)
            if (item.batchId || item.hasBatches) {
              // Get batches ordered by expiry date (FEFO)
              const batchResult = await executeSql(
                `SELECT id, remaining_qty FROM batches 
                 WHERE product_id = ? AND remaining_qty > 0 
                 ORDER BY expiry_date ASC, created_at ASC`,
                [item.productId]
              );

              for (let i = 0; i < batchResult.rows.length && remainingQty > 0; i++) {
                const batch = batchResult.rows.item(i);
                const batchId = batch.id;
                const batchAvailable = batch.remaining_qty;
                const deductFromBatch = Math.min(remainingQty, batchAvailable);

                if (deductFromBatch > 0) {
                  // Update batch remaining quantity
                  await executeSql(
                    `UPDATE batches SET remaining_qty = remaining_qty - ? WHERE id = ?`,
                    [deductFromBatch, batchId]
                  );

                  // Record batch-level stock movement with batch_id (C6)
                  await executeSql(
                    `INSERT INTO stock_movements (id, product_id, batch_id, type, quantity, reference_type, reference_id, notes, created_at)
                     VALUES (?, ?, ?, 'OUT', ?, 'INVOICE', ?, ?, ?)`,
                    [
                      uuid(),
                      item.productId,
                      batchId,
                      deductFromBatch,
                      localId,
                      `Offline sale (batch FEFO) via invoice ${localId.substring(0, 8)}`,
                      new Date().toISOString(),
                    ]
                  );

                  remainingQty -= deductFromBatch;
                }
              }

              // If we couldn't fulfill from batches, fall back to product-level deduction
              // This is a safety net - server will reconcile on sync
              if (remainingQty > 0) {
                console.warn(`Insufficient batch stock for product ${item.productId}. ${remainingQty} units not covered by batches.`);
                // Continue to product-level deduction below
              }
            }

            // C2: Product-level stock deduction (for non-batch items or remainder)
            if (remainingQty > 0 || !(item.batchId || item.hasBatches)) {
              // Update product stock
              await executeSql(
                `UPDATE products SET current_stock = current_stock - ? WHERE id = ?`,
                [remainingQty > 0 ? remainingQty : itemQuantity, item.productId]
              );

              // Record stock movement (product-level, no batch_id)
              await executeSql(
                `INSERT INTO stock_movements (id, product_id, batch_id, type, quantity, reference_type, reference_id, notes, created_at)
                 VALUES (?, ?, NULL, 'OUT', ?, 'INVOICE', ?, ?, ?)`,
                [
                  uuid(),
                  item.productId,
                  remainingQty > 0 ? remainingQty : itemQuantity,
                  localId,
                  `Offline sale via invoice ${localId.substring(0, 8)}`,
                  new Date().toISOString(),
                ]
              );
            }
          }

          // C3: Add to sync queue INSIDE the transaction (atomicity)
          await addToSyncQueue('Invoice', localId, 'CREATE', invoiceData);

          await executeSql('COMMIT');

          // Clear cart and reset pendingLocalId on successful offline save
          get().clearCart();
          set({ isProcessing: false });
          return { success: true, invoiceNumber: 'OFFLINE-' + localId.substring(0, 8) };
        } catch (dbError: any) {
          await executeSql('ROLLBACK');
          throw dbError;
        }
      }

      const message = error.response?.data?.error?.message || 'Failed to process sale';
      set({ error: message, isProcessing: false });
      return { success: false };
    }
  },

  clearError: () => set({ error: null }),
}));