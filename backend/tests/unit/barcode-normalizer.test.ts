import { normalizeBarcode, validateModulo10, expandUpcEToUpcA } from '../../src/modules/products/barcodeNormalizer';

describe('Phase 2B Milestone 1: Barcode Normalization Engine', () => {
  it('1. Valid EAN-13 barcode normalization', () => {
    // 4006381333931 (Valid EAN-13)
    const result = normalizeBarcode('4006381333931');
    expect(result.symbology).toBe('EAN-13');
    expect(result.isValidChecksum).toBe(true);
    expect(result.canonicalGtin).toBe('04006381333931');
  });

  it('2. EAN-13 with hyphens and spaces sanitization', () => {
    const result = normalizeBarcode(' 40063-8133-3931 ');
    expect(result.sanitizedInput).toBe('4006381333931');
    expect(result.symbology).toBe('EAN-13');
    expect(result.isValidChecksum).toBe(true);
    expect(result.canonicalGtin).toBe('04006381333931');
  });

  it('3. Valid EAN-8 barcode normalization', () => {
    // 96385074 is a valid EAN-8 barcode
    const result = normalizeBarcode('96385074');
    expect(result.symbology).toBe('EAN-8');
    expect(result.isValidChecksum).toBe(true);
    expect(result.canonicalGtin).toBe('00000096385074');
  });

  it('4. EAN-8 vs UPC-E distinction: Valid EAN-8 must NEVER be expanded as UPC-E', () => {
    const result = normalizeBarcode('96385074');
    expect(result.symbology).toBe('EAN-8'); // Must be EAN-8, NOT UPC-E
    expect(result.canonicalGtin).toBe('00000096385074');
  });

  it('5. Invalid EAN-8 checksum returns isValidChecksum = false', () => {
    const result = normalizeBarcode('96385079'); // Bad check digit
    expect(result.symbology).toBe('EAN-8');
    expect(result.isValidChecksum).toBe(false);
    expect(result.canonicalGtin).toBeNull();
  });

  it('6. Valid UPC-A barcode normalization', () => {
    // 012345678905 (Valid 12-digit UPC-A) -> GTIN-14 has 2 leading zeros
    const result = normalizeBarcode('012345678905');
    expect(result.symbology).toBe('UPC-A');
    expect(result.isValidChecksum).toBe(true);
    expect(result.canonicalGtin).toBe('00012345678905');
  });

  it('7. Valid UPC-E 6-digit expansion to UPC-A and GTIN-14', () => {
    // 042526 -> expands to UPC-A 004252000061 (valid check digit 1)
    const result = normalizeBarcode('042526');
    expect(result.symbology).toBe('UPC-E');
    expect(result.isValidChecksum).toBe(true);
    expect(result.canonicalGtin).toBe('00004252000061');
  });

  it('8. Valid UPC-E 8-digit normalization (00425261)', () => {
    // 00425261 (UPC-E with system digit 0, 6-digit payload 042526, check digit 1)
    const expanded = expandUpcEToUpcA('00425261');
    expect(expanded).toBe('004252000061');
  });

  it('9. Valid ITF-14 barcode normalization', () => {
    // 10070562000012 (Valid 14-digit ITF-14)
    const result = normalizeBarcode('10070562000012');
    expect(result.symbology).toBe('ITF-14');
    expect(result.isValidChecksum).toBe(true);
    expect(result.canonicalGtin).toBe('10070562000012');
  });

  it('10. Scanner hint specification overrides length heuristics when valid', () => {
    const result = normalizeBarcode('96385074', 'EAN-8');
    expect(result.symbology).toBe('EAN-8');
    expect(result.canonicalGtin).toBe('00000096385074');
  });

  it('11. Malformed non-numeric input returns UNKNOWN symbology', () => {
    const result = normalizeBarcode('INVALID-123');
    expect(result.symbology).toBe('UNKNOWN');
    expect(result.isValidChecksum).toBe(false);
    expect(result.canonicalGtin).toBeNull();
  });

  it('12. Leading zeros are preserved in canonical GTIN-14', () => {
    const result = normalizeBarcode('0012345678905'); // 13-digit EAN-13 starting with 00
    expect(result.canonicalGtin?.startsWith('00')).toBe(true);
    expect(result.canonicalGtin?.length).toBe(14);
  });
});
