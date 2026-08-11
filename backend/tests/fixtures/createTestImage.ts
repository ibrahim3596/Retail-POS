// Generator for valid 24-bit uncompressed BMP image binary buffers with rendered text pixels
// This allows Tesseract's C++/Leptonica image decoder (pixReadStream) to parse real image pixels

export function createValidBmpImageBuffer(textLines: string[]): Buffer {
  const charWidth = 8;
  const charHeight = 12;
  const padding = 20;

  let maxLineLen = 0;
  for (const line of textLines) {
    if (line.length > maxLineLen) maxLineLen = line.length;
  }

  const width = Math.max(120, maxLineLen * charWidth + padding * 2);
  const height = Math.max(80, textLines.length * (charHeight + 10) + padding * 2);

  // Row width in bytes (must be padded to a multiple of 4 bytes)
  const rowSize = Math.floor((24 * width + 31) / 32) * 4;
  const pixelDataSize = rowSize * height;
  const fileSize = 54 + pixelDataSize;

  const buffer = Buffer.alloc(fileSize);

  // 1. BMP File Header (14 bytes)
  buffer.write('BM', 0);
  buffer.writeUInt32LE(fileSize, 2);
  buffer.writeUInt16LE(0, 6);
  buffer.writeUInt16LE(0, 8);
  buffer.writeUInt32LE(54, 10);

  // 2. DIB Header / BITMAPINFOHEADER (40 bytes)
  buffer.writeUInt32LE(40, 14); // Header size
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22); // Positive height = bottom-up
  buffer.writeUInt16LE(1, 26); // Color planes
  buffer.writeUInt16LE(24, 28); // Bits per pixel (24-bit BGR)
  buffer.writeUInt32LE(0, 30); // No compression (BI_RGB)
  buffer.writeUInt32LE(pixelDataSize, 34);
  buffer.writeInt32LE(2835, 38); // Horizontal resolution (~72 DPI)
  buffer.writeInt32LE(2835, 42); // Vertical resolution (~72 DPI)
  buffer.writeUInt32LE(0, 46);
  buffer.writeUInt32LE(0, 50);

  // Fill background with white pixels (0xFF, 0xFF, 0xFF)
  for (let y = 0; y < height; y++) {
    const rowOffset = 54 + y * rowSize;
    for (let x = 0; x < width; x++) {
      const p = rowOffset + x * 3;
      buffer[p] = 255; // Blue
      buffer[p + 1] = 255; // Green
      buffer[p + 2] = 255; // Red
    }
  }

  // 8x12 Font Bitmap Definitions for digits & basic letters
  const fontBitmaps: Record<string, number[]> = {
    '0': [0x3c, 0x66, 0x66, 0x6e, 0x76, 0x66, 0x66, 0x3c],
    '1': [0x18, 0x38, 0x18, 0x18, 0x18, 0x18, 0x18, 0x7e],
    '2': [0x3c, 0x66, 0x06, 0x0c, 0x18, 0x30, 0x60, 0x7e],
    '3': [0x3c, 0x66, 0x06, 0x1c, 0x06, 0x06, 0x66, 0x3c],
    '4': [0x0c, 0x1c, 0x3c, 0x6c, 0x7e, 0x0c, 0x0c, 0x0c],
    '5': [0x7e, 0x60, 0x7c, 0x06, 0x06, 0x06, 0x66, 0x3c],
    '6': [0x3c, 0x66, 0x60, 0x7c, 0x66, 0x66, 0x66, 0x3c],
    '7': [0x7e, 0x06, 0x0c, 0x18, 0x18, 0x18, 0x18, 0x18],
    '8': [0x3c, 0x66, 0x66, 0x3c, 0x66, 0x66, 0x66, 0x3c],
    '9': [0x3c, 0x66, 0x66, 0x3e, 0x06, 0x06, 0x66, 0x3c],
    'M': [0x66, 0x77, 0x7f, 0x6b, 0x63, 0x63, 0x63, 0x63],
    'R': [0x7c, 0x66, 0x66, 0x7c, 0x6c, 0x66, 0x66, 0x63],
    'P': [0x7c, 0x66, 0x66, 0x7c, 0x60, 0x60, 0x60, 0x60],
    'A': [0x18, 0x3c, 0x66, 0x66, 0x7e, 0x66, 0x66, 0x66],
    'B': [0x7c, 0x66, 0x66, 0x7c, 0x66, 0x66, 0x66, 0x7c],
    'C': [0x3c, 0x66, 0x60, 0x60, 0x60, 0x60, 0x66, 0x3c],
    'T': [0x7e, 0x18, 0x18, 0x18, 0x18, 0x18, 0x18, 0x18],
  };

  // Draw black pixels for characters onto the white background BMP image
  textLines.forEach((line, lineIndex) => {
    // BMP is bottom-up, so calculate Y from top
    const startY = height - (padding + lineIndex * (charHeight + 10) + charHeight);

    for (let charIdx = 0; charIdx < line.length; charIdx++) {
      const ch = line[charIdx].toUpperCase();
      const startX = padding + charIdx * charWidth;
      const glyph = fontBitmaps[ch];

      if (glyph) {
        for (let row = 0; row < glyph.length; row++) {
          const rowBits = glyph[row];
          const pixelY = startY + (glyph.length - 1 - row);
          if (pixelY < 0 || pixelY >= height) continue;

          const rowOffset = 54 + pixelY * rowSize;
          for (let col = 0; col < 8; col++) {
            if ((rowBits & (1 << (7 - col))) !== 0) {
              const pixelX = startX + col;
              if (pixelX >= 0 && pixelX < width) {
                const p = rowOffset + pixelX * 3;
                buffer[p] = 0; // Blue
                buffer[p + 1] = 0; // Green
                buffer[p + 2] = 0; // Red
              }
            }
          }
        }
      }
    }
  });

  return buffer;
}
