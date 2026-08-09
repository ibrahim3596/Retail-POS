// Unit tests for receipt service
import { generateReceipt, formatReceiptForPrinter, formatReceiptFor58mm } from '../../src/modules/receipts/service';

jest.mock('../../src/shared/database/prisma', () => ({
  prisma: {
    invoice: {
      findFirst: jest.fn(),
    },
  },
}));

import { prisma } from '../../src/shared/database/prisma';

describe('Receipt Service', () => {
  const mockInvoice = {
    id: 'inv-1',
    invoiceNumber: 'INV-000001',
    storeId: 'store-1',
    createdAt: new Date('2024-01-15T10:30:00'),
    subtotal: 1000,
    discountAmount: 50,
    cgstAmount: 85.5,
    sgstAmount: 85.5,
    igstAmount: 0,
    totalTax: 171,
    roundOff: 0,
    grandTotal: 1121,
    amountPaid: 1121,
    paymentMethod: 'CASH',
    items: [
      {
        productName: 'Test Product',
        quantity: 2,
        unitPrice: 500,
        gstRate: 18,
        totalAmount: 1180,
      },
    ],
    customer: null,
    store: {
      name: 'My Store',
      gstin: '22AAAAA0000A1Z5',
      address: '123 Main Street',
      phone: '9876543210',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateReceipt', () => {
    it('should generate receipt data correctly', async () => {
      (prisma.invoice.findFirst as jest.Mock).mockResolvedValue(mockInvoice);

      const result = await generateReceipt('inv-1', 'store-1');

      expect(result.store.name).toBe('My Store');
      expect(result.store.gstin).toBe('22AAAAA0000A1Z5');
      expect(result.invoice.invoiceNumber).toBe('INV-000001');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('Test Product');
      expect(result.summary.grandTotal).toBe(1121);
      expect(result.summary.cgst).toBe(85.5);
      expect(result.summary.sgst).toBe(85.5);
    });

    it('should throw if invoice not found', async () => {
      (prisma.invoice.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(generateReceipt('non-existent', 'store-1')).rejects.toThrow('not found');
    });
  });

  describe('formatReceiptForPrinter', () => {
    it('should format receipt for 80mm printer', () => {
      const mockData = {
        store: { name: 'My Store', gstin: '22AAAAA0000A1Z5' },
        invoice: { invoiceNumber: 'INV-000001', date: '15/01/2024' },
        items: [
          { name: 'Product A', quantity: 2, unitPrice: 500, gstRate: 18, totalAmount: 1180 },
        ],
        summary: {
          subtotal: 1000,
          discount: 0,
          cgst: 90,
          sgst: 90,
          igst: 0,
          totalTax: 180,
          roundOff: 0,
          grandTotal: 1180,
          amountPaid: 1180,
          paymentMethod: 'CASH',
        },
      };

      const formatted = formatReceiptForPrinter(mockData);

      expect(formatted).toContain('My Store');
      expect(formatted).toContain('INV-000001');
      expect(formatted).toContain('Product A');
      expect(formatted).toContain('1180');
      expect(formatted).toContain('Thank you');
    });

    it('should handle discounts correctly', () => {
      const mockData = {
        store: { name: 'Store' },
        invoice: { invoiceNumber: 'INV-1', date: '01/01/2024' },
        items: [],
        summary: {
          subtotal: 1000,
          discount: 100,
          cgst: 81,
          sgst: 81,
          igst: 0,
          totalTax: 162,
          roundOff: 0,
          grandTotal: 1062,
          amountPaid: 1062,
          paymentMethod: 'UPI',
        },
      };

      const formatted = formatReceiptForPrinter(mockData);
      expect(formatted).toContain('Discount');
      expect(formatted).toContain('100');
    });
  });

  describe('formatReceiptFor58mm', () => {
    it('should format receipt for 58mm printer', () => {
      const mockData = {
        store: { name: 'My Store' },
        invoice: { invoiceNumber: 'INV-000001', date: '15/01/2024' },
        items: [
          { name: 'Product A', quantity: 1, unitPrice: 100, gstRate: 18, totalAmount: 118 },
        ],
        summary: {
          subtotal: 100,
          discount: 0,
          cgst: 9,
          sgst: 9,
          igst: 0,
          totalTax: 18,
          roundOff: 0,
          grandTotal: 118,
          amountPaid: 118,
          paymentMethod: 'CASH',
        },
      };

      const formatted = formatReceiptFor58mm(mockData);

      expect(formatted).toContain('My Store');
      expect(formatted).toContain('INV-000001');
      expect(formatted).toContain('Product A');
      expect(formatted).toContain('118');
      expect(formatted).toContain('Thank you');
    });
  });
});
