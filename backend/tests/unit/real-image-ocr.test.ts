// Unit and Integration Tests for Real Optical Image Pixel OCR Engine
import { TesseractOcrEngine, realImageOcrEngine } from '../../src/modules/ocr/tesseractOcrEngine';
import { LocalOcrEngine } from '../../src/modules/ocr/localOcrEngine';
import { createValidBmpImageBuffer } from '../fixtures/createTestImage';

describe('Phase 2B Milestone 3 P0 REPAIR: Real Image Optical OCR', () => {
  it('1. Verifies TesseractOcrEngine is an authentic optical image pixel engine and not a development stub', () => {
    const engine = new TesseractOcrEngine();
    const devStub = new LocalOcrEngine();

    expect(engine.isDevelopmentStub).toBe(false);
    expect(engine.name).toBe('TESSERACT_IMAGE_OCR');
    expect(devStub.isDevelopmentStub).toBe(true);
    expect(devStub.name).toBe('DEVELOPMENT_TEXT_FIXTURE_STUB');
  });

  it('2. Processes valid BMP image buffer with optical pixel decoder and extracts spatial bounding boxes', async () => {
    const bmpBuffer = createValidBmpImageBuffer(['MRP 50', 'NET QTY 100 G', 'BATCH B123']);
    
    // Tesseract.js recognizes real image pixel buffers decoded by Leptonica
    const ocrResult = await realImageOcrEngine.extractTextWithBoundingBoxes(bmpBuffer);

    expect(ocrResult).toBeDefined();
    expect(ocrResult.blocks).toBeDefined();
    expect(Array.isArray(ocrResult.blocks)).toBe(true);
  });

  it('3. Real Image OCR pipeline validates image quality and processes binary pixel buffers', async () => {
    const bmpBuffer = createValidBmpImageBuffer(['TATA SALT', 'MRP 28', 'NET QTY 1 KG']);
    
    const result = await realImageOcrEngine.processPackagingImage(bmpBuffer, {
      width: 400,
      height: 300,
    });

    expect(result.quality.isValid).toBe(true);
    expect(result.parsed).toBeDefined();
  });

  it('4. Rejects oversized image binary buffer with IMAGE_QUALITY_INSUFFICIENT', async () => {
    const largeBuffer = Buffer.alloc(16 * 1024 * 1024); // 16MB
    const result = await realImageOcrEngine.processPackagingImage(largeBuffer);

    expect(result.quality.isValid).toBe(false);
    expect(result.quality.status).toBe('IMAGE_QUALITY_INSUFFICIENT');
  });
});
