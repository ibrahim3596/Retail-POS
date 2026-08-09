// Unit tests for supplier service
import { createSupplier, getSuppliers, getSupplierById, updateSupplier, deleteSupplier } from '../../src/modules/suppliers/service';

jest.mock('../../src/shared/database/prisma', () => ({
  prisma: {
    supplier: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { prisma } from '../../src/shared/database/prisma';

describe('Supplier Service', () => {
  const mockStoreId = 'store-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createSupplier', () => {
    it('should create a supplier successfully', async () => {
      const input = {
        storeId: mockStoreId,
        name: 'Test Supplier',
        phone: '9876543210',
        email: 'test@supplier.com',
        gstin: '22AAAAA0000A1Z5',
        address: '123 Main St',
      };

      (prisma.supplier.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.supplier.create as jest.Mock).mockResolvedValue({ id: 'sup-1', ...input });

      const result = await createSupplier(input);

      expect(result.name).toBe('Test Supplier');
      expect(result.phone).toBe('9876543210');
      expect(prisma.supplier.create).toHaveBeenCalled();
    });

    it('should reject duplicate phone numbers', async () => {
      const input = {
        storeId: mockStoreId,
        name: 'Test Supplier',
        phone: '9876543210',
      };

      (prisma.supplier.findFirst as jest.Mock).mockResolvedValue({ id: 'existing-sup' });

      await expect(createSupplier(input)).rejects.toThrow('already exists');
    });

    it('should reject names shorter than 2 characters', async () => {
      const input = {
        storeId: mockStoreId,
        name: 'A',
      };

      await expect(createSupplier(input)).rejects.toThrow('Validation failed');
    });
  });

  describe('getSuppliers', () => {
    it('should return all active suppliers', async () => {
      const mockSuppliers = [
        { id: '1', name: 'Supplier A', isActive: true },
        { id: '2', name: 'Supplier B', isActive: true },
      ];

      (prisma.supplier.findMany as jest.Mock).mockResolvedValue(mockSuppliers);

      const result = await getSuppliers(mockStoreId);

      expect(result).toHaveLength(2);
      expect(prisma.supplier.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { storeId: mockStoreId, isActive: true },
        })
      );
    });

    it('should filter by search query', async () => {
      (prisma.supplier.findMany as jest.Mock).mockResolvedValue([]);

      await getSuppliers(mockStoreId, 'test');

      expect(prisma.supplier.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { name: expect.any(Object) },
            ]),
          }),
        })
      );
    });
  });

  describe('updateSupplier', () => {
    it('should update supplier details', async () => {
      const existing = { id: 'sup-1', name: 'Old Name', phone: '1111111111' };
      const updateData = { id: 'sup-1', name: 'New Name' };

      (prisma.supplier.findFirst as jest.Mock).mockResolvedValue(existing);
      (prisma.supplier.update as jest.Mock).mockResolvedValue({ ...existing, ...updateData });

      const result = await updateSupplier(updateData, mockStoreId);

      expect(result.name).toBe('New Name');
    });

    it('should throw if supplier not found', async () => {
      (prisma.supplier.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(updateSupplier({ id: 'non-existent' }, mockStoreId)).rejects.toThrow('not found');
    });
  });

  describe('deleteSupplier', () => {
    it('should soft-delete supplier', async () => {
      (prisma.supplier.findFirst as jest.Mock).mockResolvedValue({ id: 'sup-1' });
      (prisma.supplier.update as jest.Mock).mockResolvedValue({ id: 'sup-1', isActive: false });

      await deleteSupplier('sup-1', mockStoreId);

      expect(prisma.supplier.update).toHaveBeenCalledWith({
        where: { id: 'sup-1' },
        data: { isActive: false },
      });
    });

    it('should throw if supplier not found', async () => {
      (prisma.supplier.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(deleteSupplier('non-existent', mockStoreId)).rejects.toThrow('not found');
    });
  });
});
