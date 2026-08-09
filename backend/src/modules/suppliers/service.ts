// Supplier management service
import { prisma } from '@shared/database/prisma';
import { logger } from '@shared/utils/logger';
import { NotFoundError, ConflictError, ValidationError } from '@shared/types/errors';

export interface CreateSupplierInput {
  storeId: string;
  name: string;
  phone?: string;
  email?: string;
  gstin?: string;
  address?: string;
}

export interface UpdateSupplierInput extends Partial<Omit<CreateSupplierInput, 'storeId'>> {
  id: string;
}

/**
 * Create a new supplier
 */
export async function createSupplier(input: CreateSupplierInput) {
  if (!input.name || input.name.trim().length < 2) {
    throw new ValidationError({ name: ['Supplier name must be at least 2 characters'] });
  }

  // Check for duplicate phone within store
  if (input.phone) {
    const existing = await prisma.supplier.findFirst({
      where: { storeId: input.storeId, phone: input.phone },
    });
    if (existing) {
      throw new ConflictError(`Supplier with phone '${input.phone}' already exists`);
    }
  }

  const supplier = await prisma.supplier.create({
    data: {
      storeId: input.storeId,
      name: input.name,
      phone: input.phone,
      email: input.email,
      gstin: input.gstin,
      address: input.address,
    },
  });

  logger.info('Supplier created', { supplierId: supplier.id, storeId: input.storeId });
  return supplier;
}

/**
 * Get all suppliers for a store
 */
export async function getSuppliers(storeId: string, search?: string) {
  const where: any = { storeId, isActive: true };

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { gstin: { contains: search, mode: 'insensitive' } },
    ];
  }

  return prisma.supplier.findMany({
    where,
    orderBy: { name: 'asc' },
  });
}

/**
 * Get a single supplier
 */
export async function getSupplierById(supplierId: string, storeId: string) {
  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, storeId },
    include: {
      _count: {
        select: { purchases: true },
      },
    },
  });

  if (!supplier) {
    throw new NotFoundError('Supplier', supplierId);
  }

  return supplier;
}

/**
 * Update a supplier
 */
export async function updateSupplier(input: UpdateSupplierInput, storeId: string) {
  const existing = await prisma.supplier.findFirst({
    where: { id: input.id, storeId },
  });

  if (!existing) {
    throw new NotFoundError('Supplier', input.id);
  }

  // Check phone uniqueness if changing
  if (input.phone && input.phone !== existing.phone) {
    const duplicate = await prisma.supplier.findFirst({
      where: { storeId, phone: input.phone, id: { not: input.id } },
    });
    if (duplicate) {
      throw new ConflictError(`Supplier with phone '${input.phone}' already exists`);
    }
  }

  return prisma.supplier.update({
    where: { id: input.id },
    data: {
      name: input.name,
      phone: input.phone,
      email: input.email,
      gstin: input.gstin,
      address: input.address,
    },
  });
}

/**
 * Soft-delete a supplier
 */
export async function deleteSupplier(supplierId: string, storeId: string) {
  const existing = await prisma.supplier.findFirst({
    where: { id: supplierId, storeId },
  });

  if (!existing) {
    throw new NotFoundError('Supplier', supplierId);
  }

  return prisma.supplier.update({
    where: { id: supplierId },
    data: { isActive: false },
  });
}

/**
 * Get supplier purchase history
 */
export async function getSupplierPurchases(supplierId: string, storeId: string) {
  // This will be implemented when purchase orders are added
  // For now, return empty array
  return [];
}
