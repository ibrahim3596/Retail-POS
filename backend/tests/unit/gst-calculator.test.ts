// Unit tests for GST calculator
import {
  calculateItemGST,
  calculateInvoiceGST,
  validateGSTIN,
  getStateCodeFromGSTIN,
} from '../../src/modules/gst/calculator';

describe('GST Calculator', () => {
  describe('calculateItemGST', () => {
    it('should calculate CGST+SGST for intrastate transaction', () => {
      const item = {
        productId: '1',
        productName: 'Test Product',
        hsnCode: '1234',
        quantity: 2,
        unitPrice: 100,
        mrp: 150,
        discount: 0,
        gstRate: 18,
        taxType: 'GST' as const,
      };

      const result = calculateItemGST(item, false);

      expect(result.taxableValue).toBe(200);
      expect(result.cgstRate).toBe(9);
      expect(result.sgstRate).toBe(9);
      expect(result.igstRate).toBe(0);
      expect(result.cgstAmount).toBe(18);
      expect(result.sgstAmount).toBe(18);
      expect(result.igstAmount).toBe(0);
      expect(result.totalAmount).toBe(236);
    });

    it('should calculate IGST for interstate transaction', () => {
      const item = {
        productId: '1',
        productName: 'Test Product',
        hsnCode: '1234',
        quantity: 1,
        unitPrice: 100,
        mrp: 150,
        discount: 0,
        gstRate: 18,
        taxType: 'GST' as const,
      };

      const result = calculateItemGST(item, true);

      expect(result.cgstRate).toBe(0);
      expect(result.sgstRate).toBe(0);
      expect(result.igstRate).toBe(18);
      expect(result.cgstAmount).toBe(0);
      expect(result.sgstAmount).toBe(0);
      expect(result.igstAmount).toBe(18);
      expect(result.totalAmount).toBe(118);
    });

    it('should handle 5% GST rate correctly', () => {
      const item = {
        productId: '1',
        productName: 'Test Product',
        hsnCode: '1234',
        quantity: 1,
        unitPrice: 100,
        mrp: 150,
        discount: 0,
        gstRate: 5,
        taxType: 'GST' as const,
      };

      const result = calculateItemGST(item, false);

      expect(result.cgstRate).toBe(2.5);
      expect(result.sgstRate).toBe(2.5);
      expect(result.cgstAmount).toBe(2.5);
      expect(result.sgstAmount).toBe(2.5);
      expect(result.totalAmount).toBe(105);
    });

    it('should handle exempt items (0% tax)', () => {
      const item = {
        productId: '1',
        productName: 'Test Product',
        hsnCode: '1234',
        quantity: 1,
        unitPrice: 100,
        mrp: 150,
        discount: 0,
        gstRate: 0,
        taxType: 'EXEMPT' as const,
      };

      const result = calculateItemGST(item, false);

      expect(result.cgstRate).toBe(0);
      expect(result.sgstRate).toBe(0);
      expect(result.igstRate).toBe(0);
      expect(result.totalAmount).toBe(100);
    });

    it('should apply discount correctly', () => {
      const item = {
        productId: '1',
        productName: 'Test Product',
        hsnCode: '1234',
        quantity: 2,
        unitPrice: 100,
        mrp: 150,
        discount: 20,
        gstRate: 18,
        taxType: 'GST' as const,
      };

      const result = calculateItemGST(item, false);

      expect(result.taxableValue).toBe(180);
      expect(result.cgstAmount).toBe(16.2);
      expect(result.sgstAmount).toBe(16.2);
      expect(result.totalAmount).toBe(212.4);
    });

    it('should not allow negative taxable value', () => {
      const item = {
        productId: '1',
        productName: 'Test Product',
        hsnCode: '1234',
        quantity: 1,
        unitPrice: 50,
        mrp: 150,
        discount: 100,
        gstRate: 18,
        taxType: 'GST' as const,
      };

      const result = calculateItemGST(item, false);

      expect(result.taxableValue).toBe(0);
      expect(result.totalAmount).toBe(0);
    });
  });

  describe('calculateInvoiceGST', () => {
    it('should calculate totals for multiple items', () => {
      const items = [
        {
          productId: '1',
          productName: 'Product A',
          hsnCode: '1234',
          quantity: 2,
          unitPrice: 100,
          mrp: 150,
          discount: 0,
          gstRate: 18,
          taxType: 'GST' as const,
        },
        {
          productId: '2',
          productName: 'Product B',
          hsnCode: '5678',
          quantity: 1,
          unitPrice: 200,
          mrp: 250,
          discount: 0,
          gstRate: 12,
          taxType: 'GST' as const,
        },
      ];

      const result = calculateInvoiceGST(items, false);

      expect(result.subtotal).toBe(400);
      expect(result.totalDiscount).toBe(0);
      // Item 1: taxable=200, CGST=9%=18, SGST=9%=18
      // Item 2: taxable=200, CGST=6%=12, SGST=6%=12
      expect(result.totalCgst).toBe(30); // 18+12
      expect(result.totalSgst).toBe(30); // 18+12
      expect(result.totalIgst).toBe(0);
      expect(result.totalTax).toBe(60);
      expect(result.grandTotal).toBe(460);
    });

    it('should apply invoice-level discount', () => {
      const items = [
        {
          productId: '1',
          productName: 'Product A',
          hsnCode: '1234',
          quantity: 1,
          unitPrice: 1000,
          mrp: 1200,
          discount: 0,
          gstRate: 18,
          taxType: 'GST' as const,
        },
      ];

      const result = calculateInvoiceGST(items, false, 100);

      expect(result.totalDiscount).toBe(100);
      expect(result.totalTaxableValue).toBe(900);
      expect(result.grandTotal).toBeCloseTo(1062, 0);
    });

    it('should apply invoice-level percentage discount', () => {
      const items = [
        {
          productId: '1',
          productName: 'Product A',
          hsnCode: '1234',
          quantity: 1,
          unitPrice: 1000,
          mrp: 1200,
          discount: 0,
          gstRate: 18,
          taxType: 'GST' as const,
        },
      ];

      const result = calculateInvoiceGST(items, false, 0, 10);

      expect(result.totalDiscount).toBe(100);
      expect(result.totalTaxableValue).toBe(900);
    });

    it('should handle mixed tax types in same invoice', () => {
      const items = [
        {
          productId: '1',
          productName: 'Taxable Product',
          hsnCode: '1234',
          quantity: 1,
          unitPrice: 100,
          mrp: 150,
          discount: 0,
          gstRate: 18,
          taxType: 'GST' as const,
        },
        {
          productId: '2',
          productName: 'Exempt Product',
          hsnCode: '5678',
          quantity: 1,
          unitPrice: 100,
          mrp: 120,
          discount: 0,
          gstRate: 0,
          taxType: 'EXEMPT' as const,
        },
      ];

      const result = calculateInvoiceGST(items, false);

      expect(result.subtotal).toBe(200);
      expect(result.totalTax).toBe(18); // Only on first item
      expect(result.grandTotal).toBe(218);
    });

    it('should round grand total correctly', () => {
      const items = [
        {
          productId: '1',
          productName: 'Product',
          hsnCode: '1234',
          quantity: 1,
          unitPrice: 99.99,
          mrp: 120,
          discount: 0,
          gstRate: 18,
          taxType: 'GST' as const,
        },
      ];

      const result = calculateInvoiceGST(items, false);

      expect(result.roundedGrandTotal).toBe(Math.round(result.grandTotal));
      expect(Math.abs(result.roundOff)).toBeLessThanOrEqual(0.5);
    });
  });

  describe('validateGSTIN', () => {
    it('should validate correct GSTIN format', () => {
      expect(validateGSTIN('22AAAAA0000A1Z5')).toBe(true);
      expect(validateGSTIN('09ABCDE1234F1Z0')).toBe(true);
    });

    it('should reject invalid GSTIN', () => {
      expect(validateGSTIN('')).toBe(false);
      expect(validateGSTIN('12345')).toBe(false);
      expect(validateGSTIN('22AAAAA0000A1Z')).toBe(false); // 14 chars
      expect(validateGSTIN('22AAAAA0000A1Z55')).toBe(false); // 16 chars
      expect(validateGSTIN('22aaaaa0000a1z5')).toBe(false); // lowercase
      expect(validateGSTIN('00AAAAA0000A1Z5')).toBe(false); // 00 state code
    });

    it('should extract state code from GSTIN', () => {
      expect(getStateCodeFromGSTIN('22AAAAA0000A1Z5')).toBe('22');
      expect(getStateCodeFromGSTIN('09ABCDE1234F1Z0')).toBe('09');
      expect(getStateCodeFromGSTIN('invalid')).toBeNull();
    });
  });
});
