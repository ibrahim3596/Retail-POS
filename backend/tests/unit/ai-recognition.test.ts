// Unit tests for AI recognition service
import { recognizeProduct, getProductSuggestions, batchRecognize } from '../../src/modules/ai/recognition';

jest.mock('../../src/shared/database/prisma', () => ({
  prisma: {
    product: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    invoiceItem: {
      findMany: jest.fn(),
    },
  },
}));

import { prisma } from '../../src/shared/database/prisma';

describe('AI Recognition Service', () => {
  const mockStoreId = 'store-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('recognizeProduct', () => {
    it('should recognize product by barcode', async () => {
      const mockProduct = {
        id: 'prod-1',
        name: 'Test Product',
        category: 'Electronics',
        sellingPrice: 1000,
        currentStock: 50,
      };

      (prisma.product.findFirst as jest.Mock).mockResolvedValue(mockProduct);

      const result = await recognizeProduct(mockStoreId, undefined, '1234567890');

      expect(result.predictions).toHaveLength(1);
      expect(result.predictions[0].productId).toBe('prod-1');
      expect(result.predictions[0].confidence).toBe(0.99);
      expect(result.processingTime).toBeGreaterThanOrEqual(0);
    });

    it('should return empty predictions for unknown barcode', async () => {
      (prisma.product.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await recognizeProduct(mockStoreId, undefined, '9999999999');

      expect(result.predictions).toHaveLength(0);
    });

    it('should handle image recognition (placeholder)', async () => {
      (prisma.product.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await recognizeProduct(mockStoreId, 'base64image');

      expect(result.predictions).toHaveLength(0);
    });
  });

  describe('getProductSuggestions', () => {
    it('should return product suggestions', async () => {
      const mockItems = [
        { productId: 'p1', productName: 'A', quantity: 10 },
        { productId: 'p2', productName: 'B', quantity: 5 },
      ];

      const mockProducts = [
        { id: 'p1', name: 'Product A', category: 'Cat1', sellingPrice: 100, currentStock: 10 },
        { id: 'p2', name: 'Product B', category: 'Cat2', sellingPrice: 200, currentStock: 20 },
      ];

      (prisma.invoiceItem.findMany as jest.Mock).mockResolvedValue(mockItems);
      (prisma.product.findMany as jest.Mock).mockResolvedValue(mockProducts);

      const result = await getProductSuggestions(mockStoreId, 5);

      expect(result).toHaveLength(2);
      expect(result[0].productName).toBe('Product A');
    });

    it('should respect limit parameter', async () => {
      const mockItems = Array.from({ length: 10 }, (_, i) => ({
        productId: `p${i}`,
        productName: `Product ${i}`,
        quantity: 10 - i,
      }));

      const mockProducts = mockItems.map((item, i) => ({
        id: item.productId,
        name: item.productName,
        category: 'Cat',
        sellingPrice: 100,
        currentStock: 10,
      }));

      (prisma.invoiceItem.findMany as jest.Mock).mockResolvedValue(mockItems);
      (prisma.product.findMany as jest.Mock).mockResolvedValue(mockProducts);

      const result = await getProductSuggestions(mockStoreId, 3);

      expect(result).toHaveLength(3);
    });
  });

  describe('batchRecognize', () => {
    it('should process multiple images', async () => {
      (prisma.product.findFirst as jest.Mock).mockResolvedValue(null);

      const results = await batchRecognize(mockStoreId, ['img1', 'img2', 'img3']);

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.predictions).toEqual([]);
      });
    });
  });
});
