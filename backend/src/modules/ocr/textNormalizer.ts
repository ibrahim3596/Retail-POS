// Deterministic OCR Text Normalizer

export interface NormalizedOcrText {
  rawText: string;
  normalizedText: string;
  lines: string[];
}

export function normalizeOcrText(rawText: string): NormalizedOcrText {
  if (!rawText) {
    return { rawText: '', normalizedText: '', lines: [] };
  }

  // 1. Remove dangerous control characters (except newlines & tabs)
  const cleaned = rawText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // 2. Normalize Indian currency variations (Rs., Rs, INR, ₹)
  let normalized = cleaned
    .replace(/(?:Rs\.|Rs|INR)\s*/gi, '₹ ')
    .replace(/₹\s+/g, '₹')
    .replace(/\s+/g, ' ')
    .trim();

  // 3. Extract line breaks preserving spatial order
  const lines = cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return {
    rawText,
    normalizedText: normalized,
    lines,
  };
}
