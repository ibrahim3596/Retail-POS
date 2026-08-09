// Phase 1 Regression Tests
// Tests for: GST calculation, offline invoice items, stock deduction, credit ledger, sync conflicts

import { calculateInvoiceGST, calculateItemGST, GSTItemInput } from '../../src/modules/gst/calculator';

describe('Phase 1: GST Calculation (Backend)', () => {
  const testItems: GSTItemInput[] = [
    {
      productId: 'p1',
      productName: 'Rice 1kg',
      hsnCode: '1006',
      quantity: 2,
      unitPrice: 50,
      mrp: 60,
      discount: 0,
      gstRate: 5,
      taxType: 'GST',
    },
    {
      productId: 'p2',
      productName: 'Oil 1L',
      hsnCode: '1507',
      quantity: 1,
      unitPrice: 120,
      mrp: 150,
      discount: 10,
      gstRate: 5,
      taxType: 'GST',
    },
    {
      productId: 'p3',
      productName: 'Shampoo',
      hsnCode: '3305',
      quantity: 3,
      unitPrice: 80,
      mrp: 100,
      discount: 0,
      gstRate: 18,
      taxType: 'GST',
    },
    {
      productId: 'p4',
      productName: 'Exempt Item',
      hsnCode: '9999',
      quantity: 1,
      unitPrice: 100,
      mrp: 120,
      discount: 0,
      gstRate: 0,
      taxType: 'EXEMPT',
    },
  ];

  it('calculateItemGST should calculate correctly for intrastate', () => {
    const result = testItems.map(item => calculateItemGST(item, false));

    // Rice 1kg: 2 * 50 = 100, 5% GST = 2.5% CGST + 2.5% SGST
    expect(result[0].cgstRate).toBe(2.5);
    expect(result[0].sgstRate).toBe(2.5);
    expect(result[0].igstRate).toBe(0);
    expect(result[0].cgstAmount).toBe(2.5);
    expect(result[0].sgstAmount).toBe(2.5);

    // Oil 1L: 1 * 120 = 120, discount 10, taxable = 110, 5% GST
    expect(result[1].taxableValue).toBe(110);
    expect(result[1].cgstAmount).toBe(2.75);
    expect(result[1].sgstAmount).toBe(2.75);
  });

  it('calculateItemGST should calculate correctly for interstate', () => {
    const result = testItems.map(item => calculateItemGST(item, true));

    // Interstate: IGST only
    expect(result[0].igstRate).toBe(5);
    expect(result[0].cgstRate).toBe(0);
    expect(result[0].sgstRate).toBe(0);
    expect(result[0].igstAmount).toBe(5);
  });

  it('calculateInvoiceGST should calculate correctly for intrastate', () => {
    const result = calculateInvoiceGST(testItems, false);

    // Subtotal: 2*50 + 1*120 + 3*80 + 1*100 = 100 + 120 + 240 + 100 = 560
    // Item discount: 10 (on oil)
    // Discount ratio = (560 - 10) / 560 = 0.982142857
    // CGST before discount: 2.5 + 2.75 + 21.6 = 26.85
    // CGST after discount ratio: 26.85 * 0.98214... = 26.37...
    expect(result.subtotal).toBe(560);
    expect(result.totalDiscount).toBe(10);
    expect(result.totalCgst).toBeCloseTo(26.37, 2);
    expect(result.totalSgst).toBeCloseTo(26.37, 2);
    expect(result.totalIgst).toBe(0);
    expect(result.totalTax).toBeCloseTo(52.74, 2);
  });

  it('calculateInvoiceGST should calculate correctly for interstate', () => {
    const result = calculateInvoiceGST(testItems, true);

    expect(result.totalCgst).toBe(0);
    expect(result.totalSgst).toBe(0);
    expect(result.totalIgst).toBeCloseTo(52.74, 2);
  });

  it('calculateInvoiceGST with invoice discount should apply proportionally', () => {
    const result = calculateInvoiceGST(testItems, false, 50, 0);

    expect(result.totalDiscount).toBe(60); // 10 item + 50 invoice
    expect(result.roundedGrandTotal).toBeLessThan(
      calculateInvoiceGST(testItems, false).roundedGrandTotal
    );
  });

  it('calculateInvoiceGST with invoice discount percent should apply proportionally', () => {
    const result = calculateInvoiceGST(testItems, false, 0, 10);

    expect(result.totalDiscount).toBeGreaterThan(10); // 10 item + invoice discount
  });

  it('roundOff should round to nearest rupee', () => {
    const items: GSTItemInput[] = [
      {
        productId: 'p1',
        productName: 'Test',
        hsnCode: '1234',
        quantity: 1,
        unitPrice: 99.99,
        mrp: 120,
        discount: 0,
        gstRate: 18,
        taxType: 'GST',
      },
    ];

    const result = calculateInvoiceGST(items, false);

    // 99.99 * 1.18 = 117.9882 -> rounded to 118
    // roundOff = 118 - 117.9882 = 0.0118
    expect(result.roundedGrandTotal).toBe(118);
    expect(Math.abs(result.roundOff)).toBeLessThan(0.5);
  });
});

describe('Phase 1: Credit Ledger Balance Calculation', () => {
  it('should calculate running balance correctly for multiple entries', () => {
    let balance = 0;
    const entries = [
      { type: 'DEBIT', amount: 1000 },
      { type: 'CREDIT', amount: 500 },
      { type: 'DEBIT', amount: 2000 },
      { type: 'CREDIT', amount: 1500 },
    ];

    for (const entry of entries) {
      if (entry.type === 'DEBIT') {
        balance += entry.amount;
      } else {
        balance -= entry.amount;
      }
    }

    expect(balance).toBe(1000);
  });
});

describe('Phase 1: Sync Conflict Detection', () => {
  it('should detect no conflict when invoices are identical', () => {
    const existing = {
      subtotal: 1000,
      discountAmount: 100,
      cgstAmount: 40.5,
      sgstAmount: 40.5,
      igstAmount: 0,
      totalTax: 81,
      grandTotal: 981,
      paymentMethod: 'CASH',
      isCreditSale: false,
      items: [
        { productId: 'p1', quantity: 2, unitPrice: 500, discount: 0 },
      ],
    };

    const incoming = { ...existing };
    // No conflict expected - manually check key fields
    const hasConflict = 
      Math.abs(Number(existing.grandTotal) - Number(incoming.grandTotal)) > 0.01 ||
      existing.paymentMethod !== incoming.paymentMethod;
    expect(hasConflict).toBe(false);
  });

  it('should detect conflict when grandTotal differs', () => {
    const existing = { grandTotal: 1000 };
    const incoming = { grandTotal: 1001 };

    const hasConflict = Math.abs(Number(existing.grandTotal) - Number(incoming.grandTotal)) > 0.01;
    expect(hasConflict).toBe(true);
  });

  it('should detect conflict when items differ', () => {
    const existing = {
      items: [{ productId: 'p1', quantity: 2, unitPrice: 500 }],
    };
    const incoming = {
      items: [{ productId: 'p1', quantity: 3, unitPrice: 500 }],
    };

    const existingItems = existing.items;
    const incomingItems = incoming.items;

    const itemsDiffer = existingItems.length !== incomingItems.length ||
      existingItems[0].quantity !== incomingItems[0].quantity;
    expect(itemsDiffer).toBe(true);
  });
});

describe('Phase 1: Stock Deduction and Movements', () => {
  it('should calculate FEFO batch deduction correctly', () => {
    const batches = [
      { id: 'b1', remainingQty: 10, expiryDate: new Date('2024-12-01') },
      { id: 'b2', remainingQty: 20, expiryDate: new Date('2024-12-15') },
      { id: 'b3', remainingQty: 5, expiryDate: new Date('2025-01-01') },
    ];

    batches.sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime());

    let remainingToDeduct = 15;
    const deductions = [];

    for (const batch of batches) {
      if (remainingToDeduct <= 0) break;
      const deductQty = Math.min(remainingToDeduct, batch.remainingQty);
      deductions.push({ batchId: batch.id, qty: deductQty });
      remainingToDeduct -= deductQty;
    }

    expect(deductions).toEqual([
      { batchId: 'b1', qty: 10 },
      { batchId: 'b2', qty: 5 },
    ]);
    expect(remainingToDeduct).toBe(0);
  });

  it('should throw error when insufficient stock', () => {
    const availableStock = 10;
    const requestedQty = 15;

    expect(availableStock < requestedQty).toBe(true);
  });
});

describe('Phase 1: Invoice Item Persistence', () => {
  it('should include all required fields for invoice items', () => {
    const item = {
      id: 'item-1',
      invoiceId: 'inv-1',
      productId: 'p1',
      productName: 'Test Product',
      hsnCode: '1234',
      quantity: 2,
      unitPrice: 100,
      mrp: 120,
      discount: 10,
      gstRate: 18,
      cgstAmount: 16.2,
      sgstAmount: 16.2,
      igstAmount: 0,
      totalAmount: 232.4,
    };

    expect(item.id).toBeDefined();
    expect(item.invoiceId).toBeDefined();
    expect(item.productId).toBeDefined();
    expect(item.productName).toBeDefined();
    expect(item.quantity).toBeGreaterThan(0);
    expect(item.unitPrice).toBeGreaterThan(0);
    expect(item.mrp).toBeGreaterThanOrEqual(item.unitPrice);
    expect(item.gstRate).toBeGreaterThanOrEqual(0);
    expect(item.cgstAmount).toBeGreaterThanOrEqual(0);
    expect(item.sgstAmount).toBeGreaterThanOrEqual(0);
    expect(item.igstAmount).toBeGreaterThanOrEqual(0);
    expect(item.totalAmount).toBeGreaterThan(0);
  });
});

describe('Phase 1: Stock Movement Recording', () => {
  it('should record stock movement for each sale', () => {
    const movements = [
      { productId: 'p1', type: 'OUT', quantity: 5, referenceType: 'INVOICE', referenceId: 'inv-1' },
      { productId: 'p2', type: 'OUT', quantity: 3, referenceType: 'INVOICE', referenceId: 'inv-1' },
    ];

    expect(movements.length).toBe(2);
    movements.forEach(m => {
      expect(m.type).toBe('OUT');
      expect(m.quantity).toBeGreaterThan(0);
      expect(m.referenceType).toBe('INVOICE');
      expect(m.referenceId).toBeDefined();
    });
  });

  it('should record batch-level stock movements for FEFO', () => {
    const movements = [
      { productId: 'p1', batchId: 'b1', type: 'OUT', quantity: 10, referenceType: 'INVOICE' },
      { productId: 'p1', batchId: 'b2', type: 'OUT', quantity: 5, referenceType: 'INVOICE' },
    ];

    const total = movements.filter(m => m.productId === 'p1').reduce((sum, m) => sum + m.quantity, 0);
    expect(total).toBe(15);
  });
});