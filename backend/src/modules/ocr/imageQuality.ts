// Image Quality Inspector prior to OCR processing

export interface ImageQualityReport {
  isValid: boolean;
  status: 'OK' | 'IMAGE_QUALITY_INSUFFICIENT';
  reason?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
}

export interface ImageMetaInput {
  width?: number;
  height?: number;
  sizeBytes?: number;
  brightness?: number; // 0 (black) - 255 (white)
}

export function checkImageQuality(input: ImageMetaInput): ImageQualityReport {
  const minDimension = 100;
  const maxSizeBytes = 15 * 1024 * 1024; // 15MB

  if (input.sizeBytes && input.sizeBytes > maxSizeBytes) {
    return {
      isValid: false,
      status: 'IMAGE_QUALITY_INSUFFICIENT',
      reason: 'Image file size exceeds maximum 15MB limit',
      sizeBytes: input.sizeBytes,
    };
  }

  if (input.width !== undefined && input.height !== undefined) {
    if (input.width < minDimension || input.height < minDimension) {
      return {
        isValid: false,
        status: 'IMAGE_QUALITY_INSUFFICIENT',
        reason: `Image dimensions (${input.width}x${input.height}) below minimum ${minDimension}x${minDimension}px`,
        width: input.width,
        height: input.height,
      };
    }
  }

  if (input.brightness !== undefined) {
    if (input.brightness < 15) {
      return {
        isValid: false,
        status: 'IMAGE_QUALITY_INSUFFICIENT',
        reason: 'Image is excessively dark',
      };
    }
    if (input.brightness > 245) {
      return {
        isValid: false,
        status: 'IMAGE_QUALITY_INSUFFICIENT',
        reason: 'Image is excessively bright/washed out',
      };
    }
  }

  return {
    isValid: true,
    status: 'OK',
    width: input.width,
    height: input.height,
    sizeBytes: input.sizeBytes,
  };
}
