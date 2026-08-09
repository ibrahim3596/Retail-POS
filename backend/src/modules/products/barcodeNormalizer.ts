// Barcode Normalization Engine for Retail POS
// Supports EAN-13, EAN-8, UPC-A, UPC-E, ITF-14 GTIN normalization

export type SymbologyType = 'EAN-13' | 'EAN-8' | 'UPC-A' | 'UPC-E' | 'ITF-14' | 'UNKNOWN';

export interface NormalizedBarcodeResult {
  rawInput: string;
  sanitizedInput: string;
  symbology: SymbologyType;
  canonicalGtin: string | null;
  isValidChecksum: boolean;
}

/**
 * Standard Modulo 10 Checksum Validator for GTINs (EAN-13, EAN-8, UPC-A, ITF-14)
 */
export function validateModulo10(digits: string): boolean {
  if (!/^\d+$/.test(digits) || digits.length < 8) return false;
  
  const length = digits.length;
  const checkDigit = parseInt(digits[length - 1], 10);
  const payload = digits.substring(0, length - 1);
  
  let sum = 0;
  // Starting from right to left (excluding check digit)
  for (let i = payload.length - 1, pos = 1; i >= 0; i--, pos++) {
    const digit = parseInt(payload[i], 10);
    const weight = pos % 2 === 1 ? 3 : 1;
    sum += digit * weight;
  }
  
  const calculatedCheck = (10 - (sum % 10)) % 10;
  return calculatedCheck === checkDigit;
}

/**
 * Expands a 6-digit or 8-digit UPC-E string to a 12-digit UPC-A string.
 */
export function expandUpcEToUpcA(upcE: string): string | null {
  const digits = upcE.replace(/\D/g, '');
  
  let systemDigit = '0';
  let payload6 = '';
  let checkDigit: string | null = null;

  if (digits.length === 6) {
    payload6 = digits;
  } else if (digits.length === 8) {
    if (digits[0] !== '0' && digits[0] !== '1') return null;
    systemDigit = digits[0];
    payload6 = digits.substring(1, 7);
    checkDigit = digits[7];
  } else {
    return null;
  }

  const d1 = payload6[0];
  const d2 = payload6[1];
  const d3 = payload6[2];
  const d4 = payload6[3];
  const d5 = payload6[4];
  const d6 = payload6[5];

  let expanded10 = '';
  switch (d6) {
    case '0':
    case '1':
    case '2':
      expanded10 = `${d1}${d2}${d6}0000${d3}${d4}${d5}`;
      break;
    case '3':
      expanded10 = `${d1}${d2}${d3}00000${d4}${d5}`;
      break;
    case '4':
      expanded10 = `${d1}${d2}${d3}${d4}00000${d5}`;
      break;
    case '5':
    case '6':
    case '7':
    case '8':
    case '9':
      expanded10 = `${d1}${d2}${d3}${d4}${d5}0000${d6}`;
      break;
  }

  const upcAWithoutCheck = `${systemDigit}${expanded10}`;
  
  // Calculate check digit if missing or verify if provided
  let sum = 0;
  for (let i = upcAWithoutCheck.length - 1, pos = 1; i >= 0; i--, pos++) {
    const digit = parseInt(upcAWithoutCheck[i], 10);
    const weight = pos % 2 === 1 ? 3 : 1;
    sum += digit * weight;
  }
  const calcCheck = (10 - (sum % 10)) % 10;

  if (checkDigit !== null && parseInt(checkDigit, 10) !== calcCheck) {
    return null;
  }

  return `${upcAWithoutCheck}${calcCheck}`;
}

/**
 * Normalizes barcode input, handling scanner hints, EAN-8 vs UPC-E distinction, and GTIN-14 formatting.
 */
export function normalizeBarcode(
  rawInput: string,
  scannerSymbologyHint?: SymbologyType
): NormalizedBarcodeResult {
  if (!rawInput || typeof rawInput !== 'string') {
    return {
      rawInput: rawInput || '',
      sanitizedInput: '',
      symbology: 'UNKNOWN',
      canonicalGtin: null,
      isValidChecksum: false,
    };
  }

  const sanitized = rawInput.trim().replace(/[\s\-]/g, '');

  // Non-numeric barcodes (e.g. alphanumeric internal barcodes)
  if (!/^\d+$/.test(sanitized)) {
    return {
      rawInput,
      sanitizedInput: sanitized,
      symbology: 'UNKNOWN',
      canonicalGtin: null,
      isValidChecksum: false,
    };
  }

  // 1. Scanner symbology hint takes precedence if provided and matching length
  if (scannerSymbologyHint && scannerSymbologyHint !== 'UNKNOWN') {
    if (scannerSymbologyHint === 'EAN-8' && sanitized.length === 8) {
      const isValid = validateModulo10(sanitized);
      return {
        rawInput,
        sanitizedInput: sanitized,
        symbology: 'EAN-8',
        canonicalGtin: isValid ? sanitized.padStart(14, '0') : null,
        isValidChecksum: isValid,
      };
    }

    if (scannerSymbologyHint === 'UPC-E' && (sanitized.length === 6 || sanitized.length === 8)) {
      const expandedUpcA = expandUpcEToUpcA(sanitized);
      if (expandedUpcA) {
        return {
          rawInput,
          sanitizedInput: sanitized,
          symbology: 'UPC-E',
          canonicalGtin: expandedUpcA.padStart(14, '0'),
          isValidChecksum: true,
        };
      }
    }
  }

  // 2. Exact length-based symbology resolution
  // 14 Digits -> ITF-14 / GTIN-14
  if (sanitized.length === 14) {
    const isValid = validateModulo10(sanitized);
    return {
      rawInput,
      sanitizedInput: sanitized,
      symbology: 'ITF-14',
      canonicalGtin: isValid ? sanitized : null,
      isValidChecksum: isValid,
    };
  }

  // 13 Digits -> EAN-13
  if (sanitized.length === 13) {
    const isValid = validateModulo10(sanitized);
    return {
      rawInput,
      sanitizedInput: sanitized,
      symbology: 'EAN-13',
      canonicalGtin: isValid ? sanitized.padStart(14, '0') : null,
      isValidChecksum: isValid,
    };
  }

  // 12 Digits -> UPC-A
  if (sanitized.length === 12) {
    const isValid = validateModulo10(sanitized);
    return {
      rawInput,
      sanitizedInput: sanitized,
      symbology: 'UPC-A',
      canonicalGtin: isValid ? sanitized.padStart(14, '0') : null,
      isValidChecksum: isValid,
    };
  }

  // 8 Digits -> MUST CHECK EAN-8 FIRST! Valid EAN-8 is NEVER expanded as UPC-E.
  if (sanitized.length === 8) {
    const isEan8Valid = validateModulo10(sanitized);
    if (isEan8Valid) {
      return {
        rawInput,
        sanitizedInput: sanitized,
        symbology: 'EAN-8',
        canonicalGtin: sanitized.padStart(14, '0'),
        isValidChecksum: true,
      };
    }

    // If EAN-8 checksum fails, test if it's a valid 8-digit UPC-E
    const expandedUpcA = expandUpcEToUpcA(sanitized);
    if (expandedUpcA) {
      return {
        rawInput,
        sanitizedInput: sanitized,
        symbology: 'UPC-E',
        canonicalGtin: expandedUpcA.padStart(14, '0'),
        isValidChecksum: true,
      };
    }

    // Invalid 8-digit barcode
    return {
      rawInput,
      sanitizedInput: sanitized,
      symbology: 'EAN-8',
      canonicalGtin: null,
      isValidChecksum: false,
    };
  }

  // 6 Digits -> UPC-E
  if (sanitized.length === 6) {
    const expandedUpcA = expandUpcEToUpcA(sanitized);
    if (expandedUpcA) {
      return {
        rawInput,
        sanitizedInput: sanitized,
        symbology: 'UPC-E',
        canonicalGtin: expandedUpcA.padStart(14, '0'),
        isValidChecksum: true,
      };
    }
  }

  // Fallback for custom/internal barcode lengths
  return {
    rawInput,
    sanitizedInput: sanitized,
    symbology: 'UNKNOWN',
    canonicalGtin: sanitized.padStart(14, '0'),
    isValidChecksum: false,
  };
}
