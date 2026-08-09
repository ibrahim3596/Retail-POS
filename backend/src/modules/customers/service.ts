// Customer & Credit Ledger service
import { prisma } from '@shared/database/prisma';
import { logger } from '@shared/utils/logger';
import { NotFoundError, ConflictError, ValidationError } from '@shared/types/errors';

export interface CreateCustomerInput {
  storeId: string;
  name: string;
  phone?: string;
  email?: string;
  gstin?: string;
  address?: string;
  creditLimit?: number;
}

export interface RecordPaymentInput {
  customerId: string;
  storeId: string;
  amount: number;
  referenceType?: string;
  referenceId?: string;
  notes?: string;
}

/**
 * Create a new customer
 */
export async function createCustomer(input: CreateCustomerInput) {
  if (!input.name || input.name.trim().length < 2) {
    throw new ValidationError({ name: ['Customer name must be at least 2 characters'] });
  }

  // Check for duplicate phone
  if (input.phone) {
    const existing = await prisma.customer.findFirst({
      where: { storeId: input.storeId, phone: input.phone },
    });
    if (existing) {
      throw new ConflictError(`Customer with phone '${input.phone}' already exists`);
    }
  }

  const customer = await prisma.customer.create({
    data: {
      storeId: input.storeId,
      name: input.name,
      phone: input.phone,
      email: input.email,
      gstin: input.gstin,
      address: input.address,
      creditLimit: input.creditLimit || 0,
      balance: 0,
    },
  });

  logger.info('Customer created', { customerId: customer.id, storeId: input.storeId });
  return customer;
}

/**
 * Get all customers for a store
 */
export async function getCustomers(storeId: string, search?: string) {
  const where: any = { storeId, isActive: true };

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
    ];
  }

  return prisma.customer.findMany({
    where,
    orderBy: [
      { balance: 'desc' }, // Customers with outstanding balance first
      { name: 'asc' },
    ],
  });
}

/**
 * Get single customer with credit ledger
 */
export async function getCustomerWithLedger(customerId: string, storeId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, storeId },
    include: {
      creditLedger: {
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
      invoices: {
        where: { paymentStatus: { in: ['PENDING', 'PARTIAL'] } },
        select: {
          id: true,
          invoiceNumber: true,
          grandTotal: true,
          amountPaid: true,
          createdAt: true,
          paymentStatus: true,
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!customer) {
    throw new NotFoundError('Customer', customerId);
  }

  return customer;
}

/**
 * Record a payment from customer
 */
export async function recordPayment(input: RecordPaymentInput) {
  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, storeId: input.storeId },
  });

  if (!customer) {
    throw new NotFoundError('Customer', input.customerId);
  }

  if (input.amount <= 0) {
    throw new ValidationError({ amount: ['Payment amount must be positive'] });
  }

  if (input.amount > customer.balance) {
    throw new ValidationError({
      amount: [`Payment exceeds outstanding balance of ₹${customer.balance}`],
    });
  }

  // Record payment in transaction
  const result = await prisma.$transaction(async (tx) => {
    const newBalance = Number(customer.balance) - input.amount;

    const updatedCustomer = await tx.customer.update({
      where: { id: input.customerId },
      data: { balance: newBalance },
    });

    await tx.creditLedgerEntry.create({
      data: {
        customerId: input.customerId,
        type: 'CREDIT',
        amount: input.amount,
        balance: newBalance,
        referenceType: input.referenceType || 'PAYMENT',
        referenceId: input.referenceId,
        notes: input.notes,
      },
    });

    return updatedCustomer;
  });

  logger.info('Payment recorded', {
    customerId: input.customerId,
    amount: input.amount,
    newBalance: result.balance,
  });

  return result;
}

/**
 * Get total outstanding for store
 */
export async function getTotalOutstanding(storeId: string): Promise<{
  totalOutstanding: number;
  customerCount: number;
  overdueCount: number;
}> {
  const result = await prisma.customer.aggregate({
    where: { storeId, isActive: true, balance: { gt: 0 } },
    _sum: { balance: true },
    _count: { id: true },
  });

  return {
    totalOutstanding: Number(result._sum.balance) || 0,
    customerCount: result._count.id || 0,
    overdueCount: 0, // Would need due date tracking for real overdue
  };
}
