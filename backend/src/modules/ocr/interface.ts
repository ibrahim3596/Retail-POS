// Spatial OCR Abstraction & Data Models for Phase 2B

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrBlock {
  text: string;
  boundingBox: BoundingBox;
  confidence: number; // 0.0 - 1.0
  lineIndex: number;
}

export interface OcrResult {
  rawText: string;
  blocks: OcrBlock[];
  imageWidth: number;
  imageHeight: number;
  detectedLanguage?: string;
}

export interface OcrProvider {
  name: string;
  extractTextWithBoundingBoxes(imageBuffer: Buffer | string): Promise<OcrResult>;
}
