// Unit tests for analytics calculations
import { getSalesSummary, getDailySales, getTopProducts, getCategorySales, getHourlyDistribution, getGrowthMetrics } from '../../src/modules/analytics/service';

// Mock Prisma
jest.mock('../../src/shared/database/prisma', () => ({
  prisma: {
    invoice: {
      aggregate: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    invoiceItem: {
      findMany: jest.fn(),
    },
    product: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    batch: {
      count: jest.fn(),
    },
  },
}));

import { prisma } from '../../src/shared/database/prisma';

describe('Analytics Service', () => {
  const mockStoreId = 'store-123';
  const mockDateRange = {
    startDate: new Date('2024-01-01'),
    endDate: new Date('2024-01-31'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getSalesSummary', () => {
    it('should calculate sales summary correctly', async () => {
      (prisma.invoice.aggregate as jest.Mock).mockResolvedValue({
        _sum: {
          grandTotal: 10000,
          totalTax: 1800,
          discountAmount: 500,
        },
        _count: { id: 50 },
      });

      (prisma.invoice.groupBy as jest.Mock).mockResolvedValue([
        { paymentMethod: 'CASH', _sum: { grandTotal: 5000 } },
        { paymentMethod: 'UPI', _sum: { grandTotal: 3000 } },
        { paymentMethod: 'CARD', _sum: { grandTotal: 1500 } },
        { paymentMethod: 'CREDIT', _sum: { grandTotal: 500 } },
      ]);

      const result = await getSalesSummary(mockStoreId, mockDateRange);

      expect(result.totalRevenue).toBe(10000);
      expect(result.totalTax).toBe(1800);
      expect(result.totalDiscount).toBe(500);
      expect(result.invoiceCount).toBe(50);
      expect(result.averageOrderValue).toBe(200);
      expect(result.cashSales).toBe(5000);
      expect(result.upiSales).toBe(3000);
      expect(result.cardSales).toBe(1500);
      expect(result.creditSales).toBe(500);
    });

    it('should handle zero invoices', async () => {
      (prisma.invoice.aggregate as jest.Mock).mockResolvedValue({
        _sum: { grandTotal: null, totalTax: null, discountAmount: null },
        _count: { id: 0 },
      });

      (prisma.invoice.groupBy as jest.Mock).mockResolvedValue([]);

      const result = await getSalesSummary(mockStoreId, mockDateRange);

      expect(result.totalRevenue).toBe(0);
      expect(result.invoiceCount).toBe(0);
      expect(result.averageOrderValue).toBe(0);
    });
  });

  describe('getDailySales', () => {
    it('should group invoices by date', async () => {
      const mockInvoices = [
        { createdAt: new Date('2024-01-15'), grandTotal: 1000, totalTax: 180 },
        { createdAt: new Date('2024-01-15'), grandTotal: 500, totalTax: 90 },
        { createdAt: new Date('2024-01-16'), grandTotal: 2000, totalTax: 360 },
      ];

      (prisma.invoice.findMany as jest.Mock).mockResolvedValue(mockInvoices);

      const result = await getDailySales(mockStoreId, mockDateRange);

      expect(result).toHaveLength(2);
      expect(result[0].date).toBe('2024-01-15');
      expect(result[0].revenue).toBe(1500);
      expect(result[0].invoiceCount).toBe(2);
      expect(result[1].date).toBe('2024-01-16');
      expect(result[1].revenue).toBe(2000);
      expect(result[1].invoiceCount).toBe(1);
    });

    it('should return empty array when no invoices', async () => {
      (prisma.invoice.findMany as jest.Mock).mockResolvedValue([]);

      const result = await getDailySales(mockStoreId, mockDateRange);

      expect(result).toEqual([]);
    });
  });

  describe('getTopProducts', () => {
    it('should aggregate and sort products by revenue', async () => {
      const mockItems = [
        { productId: 'p1', productName: 'Product A', quantity: 10, totalAmount: 5000, unitPrice: 500 },
        { productId: 'p2', productName: 'Product B', quantity: 20, totalAmount: 3000, unitPrice: 150 },
        { productId: 'p1', productName: 'Product A', quantity: 5, totalAmount: 2500, unitPrice: 500 },
      ];

      (prisma.invoiceItem.findMany as jest.Mock).mockResolvedValue(mockItems);
      (prisma.product.findMany as jest.Mock).mockResolvedValue([]);

      const result = await getTopProducts(mockStoreId, mockDateRange, 10);

      expect(result).toHaveLength(2);
      expect(result[0].productId).toBe('p1');
      expect(result[0].totalRevenue).toBe(7500);
      expect(result[0].totalQuantity).toBe(15);
      expect(result[1].productId).toBe('p2');
      expect(result[1].totalRevenue).toBe(3000);
    });

    it('should respect the limit parameter', async () => {
      const mockItems = Array.from({ length: 20 }, (_, i) => ({
        productId: `p${i}`,
        productName: `Product ${i}`,
        quantity: 1,
        totalAmount: 1000 - i * 50,
        unitPrice: 100,
      }));

      (prisma.invoiceItem.findMany as jest.Mock).mockResolvedValue(mockItems);
      (prisma.product.findMany as jest.Mock).mockResolvedValue([]);

      const result = await getTopProducts(mockStoreId, mockDateRange, 5);

      expect(result).toHaveLength(5);
    });
  });

  describe('getCategorySales', () => {
    it('should group sales by category', async () => {
      const mockItems = [
        { productId: 'p1', quantity: 10, totalAmount: 5000 },
        { productId: 'p2', quantity: 20, totalAmount: 3000 },
        { productId: 'p3', quantity: 5, totalAmount: 2000 },
      ];

      (prisma.invoiceItem.findMany as jest.Mock).mockResolvedValue(mockItems);
      (prisma.product.findMany as jest.Mock).mockResolvedValue([
        { id: 'p1', category: 'Electronics' },
        { id: 'p2', category: 'Grocery' },
        { id: 'p3', category: 'Electronics' },
      ]);

      const result = await getCategorySales(mockStoreId, mockDateRange);

      expect(result).toHaveLength(2);
      const electronics = result.find((c) => c.category === 'Electronics');
      expect(electronics?.totalRevenue).toBe(7000);
      expect(electronics?.totalQuantity).toBe(15);
      expect(electronics?.percentageOfTotal).toBe(70);
    });

    it('should handle uncategorized products', async () => {
      const mockItems = [
        { productId: 'p1', quantity: 1, totalAmount: 100 },
      ];

      (prisma.invoiceItem.findMany as jest.Mock).mockResolvedValue(mockItems);
      (prisma.product.findMany as jest.Mock).mockResolvedValue([
        { id: 'p1', category: null },
      ]);

      const result = await getCategorySales(mockStoreId, mockDateRange);

      expect(result[0].category).toBe('Uncategorized');
    });
  });

  describe('getHourlyDistribution', () => {
    it('should group invoices by hour', async () => {
      const mockInvoices = [
        { createdAt: new Date('2024-01-15T10:30:00'), grandTotal: 1000 },
        { createdAt: new Date('2024-01-15T10:45:00'), grandTotal: 500 },
        { createdAt: new Date('2024-01-15T14:00:00'), grandTotal: 2000 },
      ];

      (prisma.invoice.findMany as jest.Mock).mockResolvedValue(mockInvoices);

      const result = await getHourlyDistribution(mockStoreId, mockDateRange);

      expect(result).toHaveLength(24);
      expect(result[10].invoiceCount).toBe(2);
      expect(result[10].revenue).toBe(1500);
      expect(result[14].invoiceCount).toBe(1);
      expect(result[14].revenue).toBe(2000);
      expect(result[0].invoiceCount).toBe(0);
    });
  });

  describe('getGrowthMetrics', () => {
    it('should calculate growth percentages', async () => {
      // Current period
      (prisma.invoice.aggregate as jest.Mock)
        .mockResolvedValueOnce({
          _sum: { grandTotal: 12000, totalTax: 2160, discountAmount: 600 },
          _count: { id: 60 },
        })
        // Previous period
        .mockResolvedValueOnce({
          _sum: { grandTotal: 10000, totalTax: 1800, discountAmount: 500 },
          _count: { id: 50 },
        });

      (prisma.invoice.groupBy as jest.Mock).mockResolvedValue([]);

      const result = await getGrowthMetrics(mockStoreId, mockDateRange);

      expect(result.revenueGrowth).toBe(20); // (12000-10000)/10000 * 100
      expect(result.invoiceGrowth).toBe(20); // (60-50)/50 * 100
    });

    it('should handle zero previous period', async () => {
      (prisma.invoice.aggregate as jest.Mock)
        .mockResolvedValueOnce({
          _sum: { grandTotal: 1000, totalTax: 180, discountAmount: 50 },
          _count: { id: 10 },
        })
        .mockResolvedValueOnce({
          _sum: { grandTotal: null, totalTax: null, discountAmount: null },
          _count: { id: 0 },
        });

      (prisma.invoice.groupBy as jest.Mock).mockResolvedValue([]);

      const result = await getGrowthMetrics(mockStoreId, mockDateRange);

      expect(result.revenueGrowth).toBe(0);
      expect(result.invoiceGrowth).toBe(0);
    });
  });
});
