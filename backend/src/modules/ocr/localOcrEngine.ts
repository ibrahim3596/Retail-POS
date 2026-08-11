// Development Text Fixture Stub Adapter
// IMPORTANT: This class is purely development/testing infrastructure for fast unit test execution.
// For real optical image pixel processing on JPEG/PNG photo buffers, use TesseractOcrEngine or mobile ML Kit OCR.

import { OcrProvider, OcrResult, OcrBlock } from './interface';
import { checkImageQuality, ImageMetaInput } from './imageQuality';
import { normalizeOcrText } from './textNormalizer';
import { parseIndianPackaging, ParsedIndianPackaging } from './indianPackagingParser';

export class LocalOcrEngine implements OcrProvider {
  name = 'DEVELOPMENT_TEXT_FIXTURE_STUB';
  public isDevelopmentStub = true;
  public description = 'Development stub for unit testing parser regexes without invoking optical image pixel OCR';

  /**
   * Process image text buffer/string into spatial OCR blocks
   */
  async extractTextWithBoundingBoxes(imageText: string): Promise<OcrResult> {
    const lines = imageText.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const blocks: OcrBlock[] = lines.map((text, idx) => ({
      text: text.trim(),
      lineIndex: idx,
      confidence: 0.90,
      boundingBox: {
        x: 10,
        y: idx * 30 + 10,
        width: Math.min(300, text.length * 8),
        height: 25,
      },
    }));

    return {
      rawText: imageText,
      blocks,
      imageWidth: 600,
      imageHeight: Math.max(400, lines.length * 30 + 50),
      detectedLanguage: 'en-IN',
    };
  }

  /**
   * Master Spatial OCR Pipeline Execution (Text Fixture Mode)
   */
  async processPackagingImage(
    rawOcrText: string,
    imageMeta?: ImageMetaInput
  ): Promise<{
    quality: ReturnType<typeof checkImageQuality>;
    normalizedText?: ReturnType<typeof normalizeOcrText>;
    parsed?: ParsedIndianPackaging;
  }> {
    // 1. Image Quality Check
    const quality = checkImageQuality(imageMeta || { width: 800, height: 600, sizeBytes: 500000 });
    if (!quality.isValid) {
      return { quality };
    }

    // 2. Spatial OCR Block Extraction
    const ocrResult = await this.extractTextWithBoundingBoxes(rawOcrText);

    // 3. Text Normalization
    const normalizedText = normalizeOcrText(ocrResult.rawText);

    // 4. Deterministic Indian Packaging Field Extraction
    const parsed = parseIndianPackaging(ocrResult);

    return {
      quality,
      normalizedText,
      parsed,
    };
  }
}

export const localOcrEngine = new LocalOcrEngine();
