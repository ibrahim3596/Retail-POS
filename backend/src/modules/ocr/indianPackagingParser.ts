// Deterministic Indian Packaging Field Parser
import { OcrResult, OcrBlock } from './interface';
import { normalizeBarcode } from '../products/barcodeNormalizer';

export interface ExtractedField<T> {
  value: T | null;
  rawText: string;
  source: 'OCR';
  confidence: number; // 0.0 to 1.0
  boundingBox?: { x: number; y: number; width: number; height: number };
  status: 'VERIFIED' | 'CANDIDATE' | 'CONFLICT' | 'MISSING';
  candidates?: T[];
}

export interface ParsedIndianPackaging {
  productName: ExtractedField<string>;
  brand: ExtractedField<string>;
  mrp: ExtractedField<number>;
  netQuantity: ExtractedField<{ quantity: number; unit: string }>;
  mfgDate: ExtractedField<string>;
  expiryDate: ExtractedField<string>;
  bestBeforeExpression: ExtractedField<string>;
  batchNumber: ExtractedField<string>;
  detectedBarcode: ExtractedField<string>;
  gstRate: ExtractedField<number>;
  hsnCode: ExtractedField<string>;
  hasConflicts: boolean;
  conflictDetails: string[];
}

export function parseIndianPackaging(ocr: OcrResult): ParsedIndianPackaging {
  const fullText = ocr.rawText || '';
  const blocks = ocr.blocks || [];

  const conflictDetails: string[] = [];

  // Helper to build default missing field
  const createMissing = <T>(): ExtractedField<T> => ({
    value: null,
    rawText: '',
    source: 'OCR',
    confidence: 0,
    status: 'MISSING',
  });

  // 1. MRP Extraction (Conservative)
  const mrpField = extractMrp(fullText, blocks, conflictDetails);

  // 2. Net Quantity & Pack Size Extraction
  const netQtyField = extractNetQuantity(fullText, blocks);

  // 3. Product Name & Brand Heuristics
  const nameBrand = extractNameAndBrand(blocks);

  // 4. Date Extraction (MFG, EXP, Best Before)
  const dates = extractDates(fullText);

  // 5. Batch / Lot Number Extraction
  const batchField = extractBatchNumber(fullText);

  // 6. OCR Barcode Detection (Integrated with M1 Normalizer)
  const barcodeField = extractOcrBarcode(fullText);

  // 7. Conservative GST / HSN Extraction
  const gstField = extractExplicitGst(fullText);
  const hsnField = extractExplicitHsn(fullText);

  const hasConflicts = conflictDetails.length > 0 || mrpField.status === 'CONFLICT';

  return {
    productName: nameBrand.name,
    brand: nameBrand.brand,
    mrp: mrpField,
    netQuantity: netQtyField,
    mfgDate: dates.mfg,
    expiryDate: dates.exp,
    bestBeforeExpression: dates.bestBefore,
    batchNumber: batchField,
    detectedBarcode: barcodeField,
    gstRate: gstField,
    hsnCode: hsnField,
    hasConflicts,
    conflictDetails,
  };
}

/**
 * 1. Conservative MRP Extraction
 */
function extractMrp(text: string, blocks: OcrBlock[], conflictDetails: string[]): ExtractedField<number> {
  // Filter out offers, cashbacks, savings, customer care lines
  const lines = text.split(/\r?\n/).filter((l) => {
    const lower = l.toLowerCase();
    return (
      !lower.includes('offer') &&
      !lower.includes('cashback') &&
      !lower.includes('save') &&
      !lower.includes('discount') &&
      !lower.includes('customer care') &&
      !lower.includes('helpline') &&
      !lower.includes('1800')
    );
  });

  const mrpRegex = /(?:M\.?R\.?P\.?|MAX(?:IMUM)? RETAIL PRICE)\s*(?:incl\.? of all taxes)?\s*[:=~-]?\s*(?:₹|Rs\.?|INR)?\s*([0-9]+(?:\.[0-9]{1,2})?)/gi;
  const foundValues: { val: number; rawText: string; block?: OcrBlock }[] = [];

  for (const line of lines) {
    let match;
    while ((match = mrpRegex.exec(line)) !== null) {
      const val = parseFloat(match[1]);
      if (val > 0 && val < 50000) {
        foundValues.push({ val, rawText: match[0] });
      }
    }
  }

  if (foundValues.length === 0) {
    return { value: null, rawText: '', source: 'OCR', confidence: 0, status: 'MISSING' };
  }

  // Deduplicate distinct numeric values
  const uniqueVals = Array.from(new Set(foundValues.map((f) => f.val)));

  if (uniqueVals.length > 1) {
    conflictDetails.push(`Multiple conflicting MRP values found: ${uniqueVals.map((v) => `₹${v}`).join(', ')}`);
    return {
      value: uniqueVals[0],
      rawText: foundValues.map((f) => f.rawText).join(' | '),
      source: 'OCR',
      confidence: 0.5,
      status: 'CONFLICT',
      candidates: uniqueVals,
    };
  }

  return {
    value: uniqueVals[0],
    rawText: foundValues[0].rawText,
    source: 'OCR',
    confidence: 0.92,
    status: 'CANDIDATE',
  };
}

/**
 * 2. Net Quantity Extraction
 */
function extractNetQuantity(text: string, blocks: OcrBlock[]): ExtractedField<{ quantity: number; unit: string }> {
  const qtyRegex = /(?:\bNET\s*(?:QTY|QUANTITY|WT|WEIGHT)\b|\bN\.W\.\b)?\s*[:=~-]?\s*([0-9]+(?:\.[0-9]+)?)\s*(g|kg|mg|ml|l|pcs|pieces|tablets|capsules|pack)\b/i;
  const packRegex = /\bPACK OF\s*([0-9]+)\b/i;

  let match = qtyRegex.exec(text);
  if (match) {
    const qty = parseFloat(match[1]);
    const unit = match[2].toUpperCase() === 'L' ? 'L' : match[2].toLowerCase();
    return {
      value: { quantity: qty, unit },
      rawText: match[0],
      source: 'OCR',
      confidence: 0.90,
      status: 'CANDIDATE',
    };
  }

  match = packRegex.exec(text);
  if (match) {
    const qty = parseInt(match[1], 10);
    return {
      value: { quantity: qty, unit: 'PCS' },
      rawText: match[0],
      source: 'OCR',
      confidence: 0.88,
      status: 'CANDIDATE',
    };
  }

  return { value: null, rawText: '', source: 'OCR', confidence: 0, status: 'MISSING' };
}

/**
 * 3. Product Name & Brand Spatial Heuristics
 */
function extractNameAndBrand(blocks: OcrBlock[]): { name: ExtractedField<string>; brand: ExtractedField<string> } {
  const keywords = ['MRP', 'NET QTY', 'MFG', 'EXP', 'BATCH', 'INGREDIENTS', 'ADDRESS', 'CUSTOMER CARE', 'LIC NO', 'FSSAI'];
  
  // Sort blocks by vertical position (Y ascending)
  const sorted = [...blocks].sort((a, b) => (a.boundingBox?.y || 0) - (b.boundingBox?.y || 0));
  
  const filtered = sorted.filter((b) => {
    const t = b.text.toUpperCase();
    return !keywords.some((k) => t.includes(k)) && b.text.trim().length > 2;
  });

  if (filtered.length === 0) {
    return {
      name: { value: null, rawText: '', source: 'OCR', confidence: 0, status: 'MISSING' },
      brand: { value: null, rawText: '', source: 'OCR', confidence: 0, status: 'MISSING' },
    };
  }

  const brandBlock = filtered[0];
  const nameBlock = filtered.length > 1 ? filtered[1] : filtered[0];

  return {
    brand: {
      value: brandBlock.text.trim(),
      rawText: brandBlock.text,
      source: 'OCR',
      confidence: 0.75,
      status: 'CANDIDATE',
    },
    name: {
      value: nameBlock.text.trim(),
      rawText: nameBlock.text,
      source: 'OCR',
      confidence: 0.75,
      status: 'CANDIDATE',
    },
  };
}

/**
 * 4. Date Extraction (MFG, EXP, Best Before)
 */
function extractDates(text: string): {
  mfg: ExtractedField<string>;
  exp: ExtractedField<string>;
  bestBefore: ExtractedField<string>;
} {
  const datePattern = '(?:[0-3]?[0-9][/.-])?(?:[0-1]?[0-9]|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[/.-](?:20)?(?:2[0-9]|1[0-9]|[0-9]{2})';
  
  const mfgRegex = new RegExp(`(?:MFG|MFD|MANUFACTURED)\\s*[:=~-]?\\s*(${datePattern})`, 'i');
  const expRegex = new RegExp(`(?:EXP|EXPIRY)\\s*[:=~-]?\\s*(${datePattern})`, 'i');
  const bbRegex = /BEST BEFORE\s*([0-9]+\s*(?:MONTHS|DAYS|YEARS)(?:\s*FROM\s*(?:MFG|MFD|PACKING))?)/i;

  const mfgMatch = mfgRegex.exec(text);
  const expMatch = expRegex.exec(text);
  const bbMatch = bbRegex.exec(text);

  return {
    mfg: mfgMatch
      ? { value: mfgMatch[1], rawText: mfgMatch[0], source: 'OCR', confidence: 0.85, status: 'CANDIDATE' }
      : { value: null, rawText: '', source: 'OCR', confidence: 0, status: 'MISSING' },
    exp: expMatch
      ? { value: expMatch[1], rawText: expMatch[0], source: 'OCR', confidence: 0.85, status: 'CANDIDATE' }
      : { value: null, rawText: '', source: 'OCR', confidence: 0, status: 'MISSING' },
    bestBefore: bbMatch
      ? { value: bbMatch[1], rawText: bbMatch[0], source: 'OCR', confidence: 0.85, status: 'CANDIDATE' }
      : { value: null, rawText: '', source: 'OCR', confidence: 0, status: 'MISSING' },
  };
}

/**
 * 5. Batch Number Extraction
 */
function extractBatchNumber(text: string): ExtractedField<string> {
  const batchRegex = /(?:BATCH(?:\s*NO)?|LOT(?:\s*NO)?|B\.?\s*NO\.?)\s*[:=~-]?\s*([A-Z0-9/-]{3,15})/i;
  const match = batchRegex.exec(text);

  if (match && !match[1].toLowerCase().includes('mrp') && !match[1].startsWith('1800')) {
    return {
      value: match[1].trim(),
      rawText: match[0],
      source: 'OCR',
      confidence: 0.85,
      status: 'CANDIDATE',
    };
  }

  return { value: null, rawText: '', source: 'OCR', confidence: 0, status: 'MISSING' };
}

/**
 * 6. OCR Barcode Detection (Integrated with M1 Normalizer)
 */
function extractOcrBarcode(text: string): ExtractedField<string> {
  const barcodeRegex = /\b([0-9]{8,14})\b/g;
  let match;
  
  while ((match = barcodeRegex.exec(text)) !== null) {
    const rawDigits = match[1];
    // Ignore dates (e.g. 20250809) or customer care numbers
    if (rawDigits.startsWith('1800') || rawDigits.length === 10) continue;

    const normalized = normalizeBarcode(rawDigits);
    if (normalized.isValidChecksum && normalized.canonicalGtin) {
      return {
        value: normalized.canonicalGtin,
        rawText: match[0],
        source: 'OCR',
        confidence: 0.95,
        status: 'CANDIDATE',
      };
    }
  }

  return { value: null, rawText: '', source: 'OCR', confidence: 0, status: 'MISSING' };
}

/**
 * 7. Conservative GST & HSN Extraction
 */
function extractExplicitGst(text: string): ExtractedField<number> {
  const gstRegex = /\bGST\s*[:=~-]?\s*([0-9]+(?:\.[0-9]+)?)\s*%/i;
  const match = gstRegex.exec(text);
  if (match) {
    const rate = parseFloat(match[1]);
    return { value: rate, rawText: match[0], source: 'OCR', confidence: 0.90, status: 'CANDIDATE' };
  }
  // CONSERVATIVE RULE: GST remains NULL unless explicitly printed on packaging!
  return { value: null, rawText: '', source: 'OCR', confidence: 0, status: 'MISSING' };
}

function extractExplicitHsn(text: string): ExtractedField<string> {
  const hsnRegex = /\bHSN(?:\s*CODE)?\s*[:=~-]?\s*([0-9]{4,8})\b/i;
  const match = hsnRegex.exec(text);
  if (match) {
    return { value: match[1], rawText: match[0], source: 'OCR', confidence: 0.90, status: 'CANDIDATE' };
  }
  // CONSERVATIVE RULE: HSN remains NULL unless explicitly printed on packaging!
  return { value: null, rawText: '', source: 'OCR', confidence: 0, status: 'MISSING' };
}
