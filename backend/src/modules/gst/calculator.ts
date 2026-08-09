// India GST calculation engine
// Handles CGST+SGST (intrastate) vs IGST (interstate) split
import { logger } from '@shared/utils/logger';

export interface GSTItemInput {
  productId: string;
  productName: string;
  hsnCode: string | null;
  quantity: number;
  unitPrice: number;
  mrp: number;
  discount: number;
  gstRate: number;
  taxType: 'GST' | 'EXEMPT' | 'NIL';
}

export interface GSTItemResult {
  productId: string;
  productName: string;
  hsnCode: string | null;
  quantity: number;
  unitPrice: number;
  mrp: number;
  discount: number;
  taxableValue: number;
  gstRate: number;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalAmount: number;
}

export interface GSTSummary {
  items: GSTItemResult[];
  subtotal: number;
  totalDiscount: number;
  totalTaxableValue: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  totalTax: number;
  grandTotal: number;
  roundOff: number;
  roundedGrandTotal: number;
}

/**
 * Calculate GST for a single item
 * - Taxable value = (quantity * unitPrice) - discount
 * - For intrastate: CGST = SGST = gstRate/2
 * - For interstate: IGST = gstRate
 * - EXEMPT/NIL items have 0% tax
 */
export function calculateItemGST(
  item: GSTItemInput,
  isInterstate: boolean
): GSTItemResult {
  const grossAmount = item.quantity * item.unitPrice;
  const taxableValue = Math.max(0, grossAmount - item.discount);

  let cgstRate = 0;
  let sgstRate = 0;
  let igstRate = 0;

  if (item.taxType === 'GST') {
    if (isInterstate) {
      igstRate = item.gstRate;
    } else {
      cgstRate = item.gstRate / 2;
      sgstRate = item.gstRate / 2;
    }
  }

  const cgstAmount = round2(taxableValue * (cgstRate / 100));
  const sgstAmount = round2(taxableValue * (sgstRate / 100));
  const igstAmount = round2(taxableValue * (igstRate / 100));

  const totalTax = cgstAmount + sgstAmount + igstAmount;
  const totalAmount = round2(taxableValue + totalTax);

  return {
    productId: item.productId,
    productName: item.productName,
    hsnCode: item.hsnCode,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    mrp: item.mrp,
    discount: item.discount,
    taxableValue: round2(taxableValue),
    gstRate: item.gstRate,
    cgstRate,
    sgstRate,
    igstRate,
    cgstAmount,
    sgstAmount,
    igstAmount,
    totalAmount,
  };
}

/**
 * Calculate complete GST summary for an invoice
 */
export function calculateInvoiceGST(
  items: GSTItemInput[],
  isInterstate: boolean,
  invoiceDiscount: number = 0,
  invoiceDiscountPercent: number = 0
): GSTSummary {
  // Calculate per-item GST
  const itemResults = items.map((item) => calculateItemGST(item, isInterstate));

  // Calculate totals
  let subtotal = 0;
  let totalDiscount = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;

  for (const item of itemResults) {
    subtotal += item.quantity * item.unitPrice;
    totalDiscount += item.discount;
    totalCgst += item.cgstAmount;
    totalSgst += item.sgstAmount;
    totalIgst += item.igstAmount;
  }

  // Apply invoice-level discount proportionally
  const totalItemDiscount = totalDiscount;
  let invoiceLevelDiscount = 0;

  if (invoiceDiscountPercent > 0) {
    invoiceLevelDiscount = round2(subtotal * (invoiceDiscountPercent / 100));
  } else {
    invoiceLevelDiscount = invoiceDiscount;
  }

  const effectiveTotalDiscount = totalItemDiscount + invoiceLevelDiscount;

  // Proportionally reduce tax amounts based on invoice discount
  const discountRatio = effectiveTotalDiscount > 0
    ? (subtotal - effectiveTotalDiscount) / subtotal
    : 1;

  totalCgst = round2(totalCgst * discountRatio);
  totalSgst = round2(totalSgst * discountRatio);
  totalIgst = round2(totalIgst * discountRatio);

  const totalTaxableValue = round2(subtotal - effectiveTotalDiscount);
  const totalTax = round2(totalCgst + totalSgst + totalIgst);
  const grandTotal = round2(totalTaxableValue + totalTax);

  // Round off to nearest rupee
  const roundedGrandTotal = Math.round(grandTotal);
  const roundOff = round2(roundedGrandTotal - grandTotal);

  // Update item totals proportionally for consistency
  const updatedItems = itemResults.map((item) => ({
    ...item,
    cgstAmount: round2(item.cgstAmount * discountRatio),
    sgstAmount: round2(item.sgstAmount * discountRatio),
    igstAmount: round2(item.igstAmount * discountRatio),
    totalAmount: round2(item.totalAmount * discountRatio),
  }));

  logger.debug('GST calculation complete', {
    itemCount: items.length,
    subtotal,
    totalTax,
    grandTotal,
    isInterstate,
  });

  return {
    items: updatedItems,
    subtotal: round2(subtotal),
    totalDiscount: round2(effectiveTotalDiscount),
    totalTaxableValue,
    totalCgst,
    totalSgst,
    totalIgst,
    totalTax,
    grandTotal,
    roundOff,
    roundedGrandTotal,
  };
}

/**
 * Validate GSTIN format (India)
 * Format: 22AAAAA0000A1Z5 (15 characters)
 * - First 2 digits: State code
 * - Next 10 characters: PAN (5 letters + 4 digits + 1 letter)
 * - 13th digit: Entity number (alphanumeric)
 * - 14th digit: Z (default)
 * - 15th digit: Checksum (alphanumeric)
 * Strict validation - does NOT auto-uppercased. User must provide correct case.
 */
export function validateGSTIN(gstin: string): boolean {
  if (!gstin || gstin.length !== 15) return false;

  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  if (!gstinRegex.test(gstin)) return false;

  // State code cannot be 00
  const stateCode = gstin.substring(0, 2);
  if (stateCode === '00') return false;

  return true;
}

/**
 * Normalize GSTIN to uppercase
 */
export function normalizeGSTIN(gstin: string): string {
  return gstin.trim().toUpperCase();
}

/**
 * Get state code from GSTIN
 */
export function getStateCodeFromGSTIN(gstin: string): string | null {
  if (!validateGSTIN(gstin)) return null;
  return gstin.substring(0, 2);
}

/**
 * Round to 2 decimal places
 */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
