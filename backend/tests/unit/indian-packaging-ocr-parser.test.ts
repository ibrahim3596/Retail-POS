// Unit tests for Spatial OCR & Indian Packaging Parser
import { localOcrEngine } from '../../src/modules/ocr/localOcrEngine';
import { parseIndianPackaging } from '../../src/modules/ocr/indianPackagingParser';
import { normalizeOcrText } from '../../src/modules/ocr/textNormalizer';
import { checkImageQuality } from '../../src/modules/ocr/imageQuality';

describe('Phase 2B Milestone 3: Spatial OCR & Indian Packaging Parser', () => {
  it('1. Extracts MRP from "MRP ₹50"', async () => {
    const ocr = await localOcrEngine.extractTextWithBoundingBoxes('Britannia Biscuits\nMRP ₹50');
    const parsed = parseIndianPackaging(ocr);

    expect(parsed.mrp.value).toBe(50);
    expect(parsed.mrp.status).toBe('CANDIDATE');
  });

  it('2. Extracts MRP from "MRP Rs. 50"', async () => {
    const ocr = await localOcrEngine.extractTextWithBoundingBoxes('Parle-G Gold\nMRP Rs. 50');
    const parsed = parseIndianPackaging(ocr);

    expect(parsed.mrp.value).toBe(50);
  });

  it('3. Extracts MRP from "M.R.P. ₹50.00"', async () => {
    const ocr = await localOcrEngine.extractTextWithBoundingBoxes('Maggi Noodles\nM.R.P. ₹50.00');
    const parsed = parseIndianPackaging(ocr);

    expect(parsed.mrp.value).toBe(50);
  });

  it('4. Extracts Net Quantity from "Net Qty 500 g"', async () => {
    const ocr = await localOcrEngine.extractTextWithBoundingBoxes('Tata Salt\nNet Qty 500 g');
    const parsed = parseIndianPackaging(ocr);

    expect(parsed.netQuantity.value).toEqual({ quantity: 500, unit: 'g' });
  });

  it('5. Extracts Net Quantity from "1 L"', async () => {
    const ocr = await localOcrEngine.extractTextWithBoundingBoxes('Fortune Sunflower Oil\n1 L');
    const parsed = parseIndianPackaging(ocr);

    expect(parsed.netQuantity.value).toEqual({ quantity: 1, unit: 'L' });
  });

  it('6. Extracts Pack Size from "Pack of 10"', async () => {
    const ocr = await localOcrEngine.extractTextWithBoundingBoxes('Pens\nPack of 10');
    const parsed = parseIndianPackaging(ocr);

    expect(parsed.netQuantity.value).toEqual({ quantity: 10, unit: 'PCS' });
  });

  it('7. Extracts Batch Number from "Batch No: B12345"', async () => {
    const ocr = await localOcrEngine.extractTextWithBoundingBoxes('Batch No: B12345\nMRP ₹30');
    const parsed = parseIndianPackaging(ocr);

    expect(parsed.batchNumber.value).toBe('B12345');
  });

  it('8. Extracts Manufacturing Date from "MFG 08/2025"', async () => {
    const ocr = await localOcrEngine.extractTextWithBoundingBoxes('MFG 08/2025\nEXP 08/2026');
    const parsed = parseIndianPackaging(ocr);

    expect(parsed.mfgDate.value).toBe('08/2025');
  });

  it('9. Extracts Expiry Date from "EXP 08/2026"', async () => {
    const ocr = await localOcrEngine.extractTextWithBoundingBoxes('MFG 08/2025\nEXP 08/2026');
    const parsed = parseIndianPackaging(ocr);

    expect(parsed.expiryDate.value).toBe('08/2026');
  });

  it('10. Extracts Best Before expression from "BEST BEFORE 12 MONTHS FROM MFG"', async () => {
    const ocr = await localOcrEngine.extractTextWithBoundingBoxes('MFG 01/2025\nBEST BEFORE 12 MONTHS FROM MFG');
    const parsed = parseIndianPackaging(ocr);

    expect(parsed.bestBeforeExpression.value).toBe('12 MONTHS FROM MFG');
  });

  it('11. Ignores Offer Price and extracts real MRP ("₹20 offer" vs "MRP ₹100")', async () => {
    const ocr = await localOcrEngine.extractTextWithBoundingBoxes('Special ₹20 offer inside\nMRP ₹100');
    const parsed = parseIndianPackaging(ocr);

    expect(parsed.mrp.value).toBe(100); // 100 extracted, 20 offer ignored!
  });

  it('12. Ignores Customer Care 1800 Helpline numbers for MRP', async () => {
    const ocr = await localOcrEngine.extractTextWithBoundingBoxes('Customer Care: 1800 22 2434\nMRP ₹45');
    const parsed = parseIndianPackaging(ocr);

    expect(parsed.mrp.value).toBe(45); // 45 extracted, 1800 ignored!
  });

  it('13. Detects valid GTIN barcode from OCR text and normalizes via M1 engine', async () => {
    const ocr = await localOcrEngine.extractTextWithBoundingBoxes('Product Code\n8901030889127');
    const parsed = parseIndianPackaging(ocr);

    expect(parsed.detectedBarcode.value).toBe('08901030889127'); // GTIN-14 normalized
  });

  it('14. Rejects invalid checksum barcode digits from OCR', async () => {
    const ocr = await localOcrEngine.extractTextWithBoundingBoxes('Random Digits\n12345678');
    const parsed = parseIndianPackaging(ocr);

    expect(parsed.detectedBarcode.value).toBeNull(); // Invalid EAN-8 checksum
  });

  it('15. Flags CONFLICT when multiple distinct MRP values exist', async () => {
    const ocr = await localOcrEngine.extractTextWithBoundingBoxes('MRP ₹50\nMRP ₹60');
    const parsed = parseIndianPackaging(ocr);

    expect(parsed.mrp.status).toBe('CONFLICT');
    expect(parsed.hasConflicts).toBe(true);
    expect(parsed.mrp.candidates).toEqual([50, 60]);
  });

  it('16. Rejects unusable images with IMAGE_QUALITY_INSUFFICIENT', async () => {
    const result = await localOcrEngine.processPackagingImage('Some Text', {
      width: 50, // Below 100px minimum
      height: 50,
    });

    expect(result.quality.isValid).toBe(false);
    expect(result.quality.status).toBe('IMAGE_QUALITY_INSUFFICIENT');
  });

  it('17. Conservative Rule: GST and HSN remain NULL when not explicitly printed', async () => {
    const ocr = await localOcrEngine.extractTextWithBoundingBoxes('Britannia Good Day\nMRP ₹30\nNet Qty 100g');
    const parsed = parseIndianPackaging(ocr);

    expect(parsed.gstRate.value).toBeNull();
    expect(parsed.hsnCode.value).toBeNull();
  });

  it('18. Extracts GST and HSN when explicitly printed on packaging', async () => {
    const ocr = await localOcrEngine.extractTextWithBoundingBoxes('Item\nGST: 18%\nHSN Code: 1905');
    const parsed = parseIndianPackaging(ocr);

    expect(parsed.gstRate.value).toBe(18);
    expect(parsed.hsnCode.value).toBe('1905');
  });

  it('19. Text Normalizer standardizes Rs., Rs, INR to ₹ symbol', () => {
    const norm = normalizeOcrText('Price Rs. 50, Tax Rs 9, total INR 59');

    expect(norm.normalizedText).toContain('Price ₹50');
    expect(norm.normalizedText).toContain('Tax ₹9');
    expect(norm.normalizedText).toContain('total ₹59');
  });

  it('20. Parses Indian terminology N.W. and B.No.', async () => {
    const ocr = await localOcrEngine.extractTextWithBoundingBoxes('N.W. 250 g\nB.No. LOT-99');
    const parsed = parseIndianPackaging(ocr);

    expect(parsed.netQuantity.value).toEqual({ quantity: 250, unit: 'g' });
    expect(parsed.batchNumber.value).toBe('LOT-99');
  });
});
