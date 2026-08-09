// Unit tests for customer service
import { createCustomer, getCustomers, getCustomerWithLedger, recordPayment, getTotalOutstanding } from '../../src/modules/customers/service';

jest.mock('../../src/shared/database/prisma', () => ({
  prisma: {
    customer: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
    },
    creditLedgerEntry: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

import { prisma } from '../../src/shared/database/prisma';

describe('Customer Service', () => {
  const mockStoreId = 'store-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createCustomer', () => {
    it('should create a customer successfully', async () => {
      const input = {
        storeId: mockStoreId,
        name: 'John Doe',
        phone: '9876543210',
        email: 'john@example.com',
        creditLimit: 5000,
      };

      (prisma.customer.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.customer.create as jest.Mock).mockResolvedValue({ id: 'cust-1', ...input, balance: 0 });

      const result = await createCustomer(input);

      expect(result.name).toBe('John Doe');
      expect(result.balance).toBe(0);
    });

    it('should reject duplicate phone numbers', async () => {
      const input = {
        storeId: mockStoreId,
        name: 'John Doe',
        phone: '9876543210',
      };

      (prisma.customer.findFirst as jest.Mock).mockResolvedValue({ id: 'existing' });

      await expect(createCustomer(input)).rejects.toThrow('already exists');
    });

    it('should reject names shorter than 2 characters', async () => {
      const input = {
        storeId: mockStoreId,
        name: 'A',
      };

      await expect(createCustomer(input)).rejects.toThrow('Validation failed');
    });
  });

  describe('getCustomers', () => {
    it('should return customers sorted by balance desc then name', async () => {
      const mockCustomers = [
        { id: '1', name: 'A', balance: 5000 },
        { id: '2', name: 'B', balance: 3000 },
      ];

      (prisma.customer.findMany as jest.Mock).mockResolvedValue(mockCustomers);

      const result = await getCustomers(mockStoreId);

      expect(result).toHaveLength(2);
      expect(prisma.customer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { storeId: mockStoreId, isActive: true },
          orderBy: [{ balance: 'desc' }, { name: 'asc' }],
        })
      );
    });

    it('should filter by search query', async () => {
      (prisma.customer.findMany as jest.Mock).mockResolvedValue([]);

      await getCustomers(mockStoreId, 'john');

      expect(prisma.customer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.any(Array),
          }),
        })
      );
    });
  });

  describe('recordPayment', () => {
    it('should record payment and update balance', async () => {
      const mockCustomer = {
        id: 'cust-1',
        storeId: mockStoreId,
        balance: 5000,
      };

      (prisma.customer.findFirst as jest.Mock).mockResolvedValue(mockCustomer);
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => fn(prisma));
      (prisma.customer.update as jest.Mock).mockResolvedValue({ ...mockCustomer, balance: 3000 });
      (prisma.creditLedgerEntry.create as jest.Mock).mockResolvedValue({});

      const result = await recordPayment({
        customerId: 'cust-1',
        storeId: mockStoreId,
        amount: 2000,
        notes: 'Cash received',
      });

      expect(result.balance).toBe(3000);
      expect(prisma.creditLedgerEntry.create).toHaveBeenCalled();
    });

    it('should reject payment exceeding balance', async () => {
      const mockCustomer = {
        id: 'cust-1',
        storeId: mockStoreId,
        balance: 1000,
      };

      (prisma.customer.findFirst as jest.Mock).mockResolvedValue(mockCustomer);

      await expect(
        recordPayment({
          customerId: 'cust-1',
          storeId: mockStoreId,
          amount: 2000,
        })
      ).rejects.toThrow('Validation failed');
    });

    it('should reject negative or zero payment', async () => {
      const mockCustomer = {
        id: 'cust-1',
        storeId: mockStoreId,
        balance: 1000,
      };

      (prisma.customer.findFirst as jest.Mock).mockResolvedValue(mockCustomer);

      await expect(
        recordPayment({
          customerId: 'cust-1',
          storeId: mockStoreId,
          amount: -100,
        })
      ).rejects.toThrow('Validation failed');
    });
  });

  describe('getTotalOutstanding', () => {
    it('should return total outstanding amount', async () => {
      (prisma.customer.aggregate as jest.Mock).mockResolvedValue({
        _sum: { balance: 15000 },
        _count: { id: 5 },
      });

      const result = await getTotalOutstanding(mockStoreId);

      expect(result.totalOutstanding).toBe(15000);
      expect(result.customerCount).toBe(5);
    });

    it('should handle zero outstanding', async () => {
      (prisma.customer.aggregate as jest.Mock).mockResolvedValue({
        _sum: { balance: null },
        _count: { id: 0 },
      });

      const result = await getTotalOutstanding(mockStoreId);

      expect(result.totalOutstanding).toBe(0);
      expect(result.customerCount).toBe(0);
    });
  });
});
