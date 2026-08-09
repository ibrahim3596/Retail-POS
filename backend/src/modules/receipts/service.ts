// Receipt generation service
import { prisma } from '@shared/database/prisma';
import { logger } from '@shared/utils/logger';
import { NotFoundError } from '@shared/types/errors';

export interface ReceiptItem {
  name: string;
  quantity: number;
  unitPrice: number;
  gstRate: number;
  totalAmount: number;
}

export interface ReceiptData {
  store: {
    name: string;
    gstin?: string;
    address?: string;
    phone?: string;
  };
  invoice: {
    invoiceNumber: string;
    date: string;
    customerName?: string;
    customerGstin?: string;
  };
  items: ReceiptItem[];
  summary: {
    subtotal: number;
    discount: number;
    cgst: number;
    sgst: number;
    igst: number;
    totalTax: number;
    roundOff: number;
    grandTotal: number;
    amountPaid: number;
    paymentMethod: string;
  };
}

/**
 * Generate receipt data for an invoice
 */
export async function generateReceipt(invoiceId: string, storeId: string): Promise<ReceiptData> {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, storeId },
    include: {
      items: true,
      customer: true,
      store: true,
    },
  });

  if (!invoice) {
    throw new NotFoundError('Invoice', invoiceId);
  }

  const receiptData: ReceiptData = {
    store: {
      name: invoice.store.name,
      gstin: invoice.store.gstin || undefined,
      address: invoice.store.address || undefined,
      phone: invoice.store.phone || undefined,
    },
    invoice: {
      invoiceNumber: invoice.invoiceNumber,
      date: invoice.createdAt.toLocaleString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      customerName: invoice.customer?.name,
      customerGstin: invoice.customer?.gstin || undefined,
    },
    items: invoice.items.map((item) => ({
      name: item.productName,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      gstRate: Number(item.gstRate),
      totalAmount: Number(item.totalAmount),
    })),
    summary: {
      subtotal: Number(invoice.subtotal),
      discount: Number(invoice.discountAmount),
      cgst: Number(invoice.cgstAmount),
      sgst: Number(invoice.sgstAmount),
      igst: Number(invoice.igstAmount),
      totalTax: Number(invoice.totalTax),
      roundOff: Number(invoice.roundOff),
      grandTotal: Number(invoice.grandTotal),
      amountPaid: Number(invoice.amountPaid),
      paymentMethod: invoice.paymentMethod,
    },
  };

  logger.info('Receipt generated', { invoiceNumber: invoice.invoiceNumber });
  return receiptData;
}

/**
 * Format receipt as plain text for thermal printers
 * Optimized for 80mm thermal printers (32 chars per line)
 */
export function formatReceiptForPrinter(data: ReceiptData): string {
  const line = '='.repeat(32);
  const thinLine = '-'.repeat(32);

  let receipt = '';

  // Header
  receipt += `${data.store.name}\n`;
  if (data.store.gstin) {
    receipt += `GSTIN: ${data.store.gstin}\n`;
  }
  if (data.store.address) {
    receipt += `${data.store.address}\n`;
  }
  if (data.store.phone) {
    receipt += `Ph: ${data.store.phone}\n`;
  }
  receipt += `${line}\n`;

  // Invoice info
  receipt += `Invoice: ${data.invoice.invoiceNumber}\n`;
  receipt += `Date: ${data.invoice.date}\n`;
  if (data.invoice.customerName) {
    receipt += `Customer: ${data.invoice.customerName}\n`;
  }
  if (data.invoice.customerGstin) {
    receipt += `GSTIN: ${data.invoice.customerGstin}\n`;
  }
  receipt += `${thinLine}\n`;

  // Items header
  receipt += `Item               Qty   Amount\n`;
  receipt += `${thinLine}\n`;

  // Items
  for (const item of data.items) {
    const name = item.name.substring(0, 15).padEnd(15);
    const qty = item.quantity.toString().padStart(5);
    const amount = item.totalAmount.toFixed(2).padStart(8);
    receipt += `${name} ${qty} ${amount}\n`;
  }

  receipt += `${thinLine}\n`;

  // Summary
  receipt += `Subtotal: ${' '.repeat(17)}${data.summary.subtotal.toFixed(2)}\n`;
  if (data.summary.discount > 0) {
    receipt += `Discount:${' '.repeat(17)}-${data.summary.discount.toFixed(2)}\n`;
  }
  if (data.summary.cgst > 0) {
    receipt += `CGST:   ${' '.repeat(17)}${data.summary.cgst.toFixed(2)}\n`;
  }
  if (data.summary.sgst > 0) {
    receipt += `SGST:   ${' '.repeat(17)}${data.summary.sgst.toFixed(2)}\n`;
  }
  if (data.summary.igst > 0) {
    receipt += `IGST:   ${' '.repeat(17)}${data.summary.igst.toFixed(2)}\n`;
  }
  receipt += `${thinLine}\n`;
  receipt += `TOTAL:  ${' '.repeat(17)}${data.summary.grandTotal.toFixed(2)}\n`;
  receipt += `${line}\n`;

  // Payment info
  receipt += `Payment: ${data.summary.paymentMethod}\n`;
  receipt += `Paid:    ${' '.repeat(17)}${data.summary.amountPaid.toFixed(2)}\n`;
  receipt += `${line}\n`;
  receipt += `\n`;
  receipt += `     Thank you for visiting!\n`;
  receipt += `\n\n\n`; // Feed paper

  return receipt;
}

/**
 * Format receipt for 58mm thermal printers (shorter lines)
 */
export function formatReceiptFor58mm(data: ReceiptData): string {
  const line = '='.repeat(32);
  const thinLine = '-'.repeat(32);

  let receipt = `${data.store.name}\n`;
  if (data.store.gstin) receipt += `${data.store.gstin}\n`;
  receipt += `${line}\n`;
  receipt += `${data.invoice.invoiceNumber} ${data.invoice.date}\n`;
  receipt += `${thinLine}\n`;

  for (const item of data.items) {
    receipt += `${item.name.substring(0, 20)}\n`;
    receipt += `${item.quantity} x ${item.unitPrice} = ${item.totalAmount}\n`;
  }

  receipt += `${thinLine}\n`;
  receipt += `TOTAL: ${data.summary.grandTotal}\n`;
  receipt += `${line}\n`;
  receipt += `Thank you!\n\n\n`;

  return receipt;
}
