// Unit tests for AI demand forecasting
import { generateDemandForecast, getReorderRecommendations } from '../../src/modules/ai/forecasting';

jest.mock('../../src/shared/database/prisma', () => ({
  prisma: {
    product: {
      findMany: jest.fn(),
    },
    invoiceItem: {
      findMany: jest.fn(),
    },
  },
}));

import { prisma } from '../../src/shared/database/prisma';

describe('AI Demand Forecasting', () => {
  const mockStoreId = 'store-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateDemandForecast', () => {
    it('should generate forecast for products with sales data', async () => {
      const mockProducts = [
        { id: 'p1', name: 'Product A', currentStock: 50, minStock: 10, sellingPrice: 100 },
        { id: 'p2', name: 'Product B', currentStock: 20, minStock: 5, sellingPrice: 200 },
      ];

      const mockSales = [
        { productId: 'p1', quantity: 5 },
        { productId: 'p1', quantity: 3 },
        { productId: 'p1', quantity: 7 },
        { productId: 'p2', quantity: 2 },
        { productId: 'p2', quantity: 4 },
      ];

      (prisma.product.findMany as jest.Mock).mockResolvedValue(mockProducts);
      (prisma.invoiceItem.findMany as jest.Mock).mockResolvedValue(mockSales);

      const result = await generateDemandForecast(mockStoreId, 30);

      expect(result.productForecasts).toHaveLength(2);
      expect(result.generatedAt).toBeDefined();
      expect(result.totalPredictedRevenue).toBeGreaterThanOrEqual(0);
    });

    it('should handle products with no sales data', async () => {
      const mockProducts = [
        { id: 'p1', name: 'New Product', currentStock: 10, minStock: 5, sellingPrice: 50 },
      ];

      (prisma.product.findMany as jest.Mock).mockResolvedValue(mockProducts);
      (prisma.invoiceItem.findMany as jest.Mock).mockResolvedValue([]);

      const result = await generateDemandForecast(mockStoreId, 30);

      expect(result.productForecasts).toHaveLength(1);
      expect(result.productForecasts[0].predictedDemand).toBe(0);
      expect(result.productForecasts[0].confidence).toBe(0);
    });

    it('should identify stock-out risks', async () => {
      const mockProducts = [
        { id: 'p1', name: 'Low Stock Item', currentStock: 2, minStock: 10, sellingPrice: 100 },
      ];

      const mockSales = Array.from({ length: 30 }, () => ({
        productId: 'p1',
        quantity: 5,
      }));

      (prisma.product.findMany as jest.Mock).mockResolvedValue(mockProducts);
      (prisma.invoiceItem.findMany as jest.Mock).mockResolvedValue(mockSales);

      const result = await generateDemandForecast(mockStoreId, 30);

      expect(result.stockOutRisk.length).toBeGreaterThan(0);
      expect(result.stockOutRisk[0].productId).toBe('p1');
    });

    it('should calculate trend correctly', async () => {
      const mockProducts = [
        { id: 'p1', name: 'Trending Product', currentStock: 100, minStock: 10, sellingPrice: 50 },
      ];

      // Increasing trend - more recent sales
      const mockSales = [
        ...Array.from({ length: 10 }, () => ({ productId: 'p1', quantity: 2 })),
        ...Array.from({ length: 10 }, () => ({ productId: 'p1', quantity: 8 })),
      ];

      (prisma.product.findMany as jest.Mock).mockResolvedValue(mockProducts);
      (prisma.invoiceItem.findMany as jest.Mock).mockResolvedValue(mockSales);

      const result = await generateDemandForecast(mockStoreId, 30);

      expect(result.productForecasts[0].trend).toBe('increasing');
      expect(result.productForecasts[0].trendPercentage).toBeGreaterThan(0);
    });
  });

  describe('getReorderRecommendations', () => {
    it('should return products needing reorder', async () => {
      const mockProducts = [
        { id: 'p1', name: 'Low Stock', currentStock: 5, minStock: 20, sellingPrice: 100 },
        { id: 'p2', name: 'Well Stocked', currentStock: 100, minStock: 10, sellingPrice: 50 },
      ];

      // High daily sales rate (200 sales of qty 10 over 90 days = ~22/day)
      // currentStock 5 / 22 = 0.22 days remaining -> high urgency
      const mockSales = Array.from({ length: 200 }, () => ({
        productId: 'p1',
        quantity: 10,
      }));

      (prisma.product.findMany as jest.Mock).mockResolvedValue(mockProducts);
      (prisma.invoiceItem.findMany as jest.Mock).mockResolvedValue(mockSales);

      const result = await getReorderRecommendations(mockStoreId);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].urgency).toBe('high');
    });

    it('should sort by urgency', async () => {
      const mockProducts = [
        { id: 'p1', name: 'Critical', currentStock: 1, minStock: 20, sellingPrice: 100 },
        { id: 'p2', name: 'Low', currentStock: 5, minStock: 20, sellingPrice: 100 },
        { id: 'p3', name: 'OK', currentStock: 50, minStock: 10, sellingPrice: 100 },
      ];

      const mockSales = Array.from({ length: 30 }, (_, i) => ({
        productId: i % 3 === 0 ? 'p1' : i % 3 === 1 ? 'p2' : 'p3',
        quantity: 10,
      }));

      (prisma.product.findMany as jest.Mock).mockResolvedValue(mockProducts);
      (prisma.invoiceItem.findMany as jest.Mock).mockResolvedValue(mockSales);

      const result = await getReorderRecommendations(mockStoreId);

      if (result.length > 1) {
        const urgencyOrder = { high: 0, medium: 1, low: 2 };
        expect(urgencyOrder[result[0].urgency]).toBeLessThanOrEqual(urgencyOrder[result[1].urgency]);
      }
    });
  });
});
