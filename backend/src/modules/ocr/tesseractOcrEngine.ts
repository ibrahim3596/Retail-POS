// Real Optical Image Pixel OCR Engine using Tesseract.js
import { createWorker } from 'tesseract.js';
import { OcrProvider, OcrResult, OcrBlock } from './interface';
import { checkImageQuality, ImageMetaInput } from './imageQuality';
import { normalizeOcrText } from './textNormalizer';
import { parseIndianPackaging, ParsedIndianPackaging } from './indianPackagingParser';

export class TesseractOcrEngine implements OcrProvider {
  name = 'TESSERACT_IMAGE_OCR';
  public isDevelopmentStub = false;

  /**
   * Process actual image binary buffer / file path / base64 string using neural OCR
   */
  async extractTextWithBoundingBoxes(imageInput: Buffer | string): Promise<OcrResult> {
    const worker = await createWorker('eng');

    try {
      const { data } = await worker.recognize(imageInput);
      const blocks: OcrBlock[] = [];

      let lineIdx = 0;
      for (const block of data.blocks || []) {
        for (const paragraph of block.paragraphs || []) {
          for (const line of paragraph.lines || []) {
            const bbox = line.bbox || { x0: 0, y0: 0, x1: 0, y1: 0 };
            const width = Math.max(1, bbox.x1 - bbox.x0);
            const height = Math.max(1, bbox.y1 - bbox.y0);

            blocks.push({
              text: line.text.trim(),
              confidence: line.confidence / 100, // Normalize 0.0 - 1.0
              lineIndex: lineIdx++,
              boundingBox: {
                x: bbox.x0,
                y: bbox.y0,
                width,
                height,
              },
            });
          }
        }
      }

      // If blocks are empty, fallback to lines from raw text
      if (blocks.length === 0 && data.text) {
        const rawLines = data.text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        rawLines.forEach((l, idx) => {
          blocks.push({
            text: l.trim(),
            confidence: (data.confidence || 80) / 100,
            lineIndex: idx,
            boundingBox: { x: 10, y: idx * 30 + 10, width: Math.min(300, l.length * 8), height: 25 },
          });
        });
      }

      return {
        rawText: data.text || '',
        blocks,
        imageWidth: 800,
        imageHeight: Math.max(600, blocks.length * 30),
        detectedLanguage: 'eng',
      };
    } finally {
      await worker.terminate();
    }
  }

  /**
   * Full Real Image OCR Pipeline:
   * 1. Image Quality Verification
   * 2. Neural Optical Image Pixel OCR
   * 3. Spatial Text Normalization
   * 4. Indian Packaging Field Parsing
   */
  async processPackagingImage(
    imageInput: Buffer | string,
    imageMeta?: ImageMetaInput
  ): Promise<{
    quality: ReturnType<typeof checkImageQuality>;
    normalizedText?: ReturnType<typeof normalizeOcrText>;
    parsed?: ParsedIndianPackaging;
  }> {
    let sizeBytes: number | undefined = imageMeta?.sizeBytes;
    if (Buffer.isBuffer(imageInput)) {
      sizeBytes = imageInput.length;
    }

    const quality = checkImageQuality({
      ...imageMeta,
      sizeBytes,
    });

    if (!quality.isValid) {
      return { quality };
    }

    const ocrResult = await this.extractTextWithBoundingBoxes(imageInput);
    const normalizedText = normalizeOcrText(ocrResult.rawText);
    const parsed = parseIndianPackaging(ocrResult);

    return {
      quality,
      normalizedText,
      parsed,
    };
  }
}

export const realImageOcrEngine = new TesseractOcrEngine();
