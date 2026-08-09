// AI Product Recognition service
// Uses image recognition to identify products from camera
import { prisma } from '@shared/database/prisma';
import { logger } from '@shared/utils/logger';

export interface ProductPrediction {
  productId: string;
  productName: string;
  confidence: number;
  category?: string;
  sellingPrice: number;
  currentStock: number;
}

export interface RecognitionResult {
  predictions: ProductPrediction[];
  processingTime: number;
}

/**
 * Recognize product from image
 * In production, this would integrate with:
 * - TensorFlow Lite model
 * - Google ML Kit
 * - Custom-trained CNN model
 * - Or cloud API (Google Vision, AWS Rekognition)
 *
 * For now, implements barcode-based recognition as primary method
 * with image-based as fallback (placeholder for ML model integration)
 */
export async function recognizeProduct(
  storeId: string,
  imageData?: string,
  barcode?: string
): Promise<RecognitionResult> {
  const startTime = Date.now();

  const predictions: ProductPrediction[] = [];

  // Method 1: Barcode-based recognition (fast, accurate)
  if (barcode) {
    const product = await prisma.product.findFirst({
      where: { storeId, barcode, isActive: true },
      select: {
        id: true,
        name: true,
        category: true,
        sellingPrice: true,
        currentStock: true,
      },
    });

    if (product) {
      predictions.push({
        productId: product.id,
        productName: product.name,
        confidence: 0.99,
        category: product.category || undefined,
        sellingPrice: Number(product.sellingPrice),
        currentStock: Number(product.currentStock),
      });
    }
  }

  // Method 2: Image-based recognition (placeholder for ML model)
  // In production, this would:
  // 1. Preprocess image (resize, normalize)
  // 2. Run through TensorFlow Lite model
  // 3. Get top-K predictions
  // 4. Map predictions to products in database
  if (imageData && predictions.length === 0) {
    // Placeholder: In production, integrate ML model here
    // const modelOutput = await runInference(imageData);
    // predictions = await mapModelOutputToProducts(modelOutput, storeId);

    logger.info('Image recognition requested (ML model not integrated yet)', {
      storeId,
      imageSize: imageData.length,
    });
  }

  // Method 3: If no barcode, try to find by name similarity
  if (!barcode && predictions.length === 0) {
    // Could implement OCR to extract text from image
    // and match against product names
    logger.info('OCR-based recognition not yet implemented', { storeId });
  }

  const processingTime = Date.now() - startTime;

  logger.info('Product recognition complete', {
    storeId,
    predictions: predictions.length,
    processingTime,
  });

  return {
    predictions,
    processingTime,
  };
}

/**
 * Get product suggestions based on image features
 * Uses color/pattern matching as fallback when barcode is unavailable
 */
export async function getProductSuggestions(
  storeId: string,
  limit: number = 5
): Promise<ProductPrediction[]> {
  // In production, this would:
  // 1. Extract visual features from image
  // 2. Compare with product image embeddings
  // 3. Return most similar products

  // For now, return most frequently sold products as suggestions
  const topProducts = await prisma.invoiceItem.findMany({
    where: {
      invoice: { storeId, status: 'COMPLETED' },
    },
    select: {
      productId: true,
      productName: true,
      quantity: true,
    },
    orderBy: { quantity: 'desc' },
    take: limit,
    distinct: ['productId'],
  });

  const products = await prisma.product.findMany({
    where: {
      id: { in: topProducts.map((p) => p.productId) },
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      category: true,
      sellingPrice: true,
      currentStock: true,
    },
  });

  return products
    .slice(0, limit)
    .map((p) => ({
      productId: p.id,
      productName: p.name,
      confidence: 0.5, // Low confidence since this is just suggestions
      category: p.category || undefined,
      sellingPrice: Number(p.sellingPrice),
      currentStock: Number(p.currentStock),
    }));
}

/**
 * Batch process multiple images for product recognition
 * Useful for inventory counting via photos
 */
export async function batchRecognize(
  storeId: string,
  images: string[]
): Promise<RecognitionResult[]> {
  const results: RecognitionResult[] = [];

  for (const image of images) {
    const result = await recognizeProduct(storeId, image);
    results.push(result);
  }

  return results;
}
