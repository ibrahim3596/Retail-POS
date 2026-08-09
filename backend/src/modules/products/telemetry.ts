// Identification Telemetry & Audit Logger
import { prisma } from '@shared/database/prisma';

export interface IdentificationAttemptLogInput {
  storeId: string;
  rawBarcode?: string;
  normalizedBarcode?: string;
  attemptType: 'LOCAL_STORE' | 'GLOBAL_CATALOG' | 'CACHE' | 'EXTERNAL_PROVIDER' | 'MANUAL';
  rawOcrText?: string;
  providerUsed?: string;
  latencyMs: number;
  costIncurred?: number;
  success: boolean;
  createdProductId?: string;
}

export class IdentificationTelemetryService {
  private inMemoryStats = {
    localHits: 0,
    globalCatalogHits: 0,
    cacheHits: 0,
    negativeCacheHits: 0,
    providerHits: 0,
    providerMisses: 0,
    providerErrors: 0,
    totalLatencyMs: 0,
    totalAttempts: 0,
  };

  /**
   * Log an identification attempt to database for audit and observability
   */
  async logAttempt(input: IdentificationAttemptLogInput): Promise<string | null> {
    try {
      this.inMemoryStats.totalAttempts++;
      this.inMemoryStats.totalLatencyMs += input.latencyMs;

      if (input.attemptType === 'LOCAL_STORE' && input.success) this.inMemoryStats.localHits++;
      if (input.attemptType === 'GLOBAL_CATALOG' && input.success) this.inMemoryStats.globalCatalogHits++;
      if (input.attemptType === 'CACHE' && input.success) this.inMemoryStats.cacheHits++;
      if (input.attemptType === 'EXTERNAL_PROVIDER') {
        if (input.success) this.inMemoryStats.providerHits++;
        else this.inMemoryStats.providerMisses++;
      }

      const attempt = await prisma.productIdentificationAttempt.create({
        data: {
          storeId: input.storeId,
          rawBarcode: input.rawBarcode || null,
          normalizedBarcode: input.normalizedBarcode || null,
          attemptType: input.attemptType,
          rawOcrText: input.rawOcrText || null,
          providerUsed: input.providerUsed || null,
          latencyMs: input.latencyMs,
          costIncurred: input.costIncurred || 0,
          success: input.success,
          createdProductId: input.createdProductId || null,
        },
      });

      return attempt.id;
    } catch {
      // Non-blocking observability log failure
      return null;
    }
  }

  /**
   * Record negative cache hit
   */
  recordNegativeCacheHit(): void {
    this.inMemoryStats.negativeCacheHits++;
  }

  /**
   * Record provider error
   */
  recordProviderError(): void {
    this.inMemoryStats.providerErrors++;
  }

  /**
   * Get aggregate telemetry metrics
   */
  getTelemetrySummary() {
    const total = this.inMemoryStats.totalAttempts || 1;
    return {
      totalAttempts: this.inMemoryStats.totalAttempts,
      localHitRate: Number((this.inMemoryStats.localHits / total).toFixed(4)),
      globalCatalogHitRate: Number((this.inMemoryStats.globalCatalogHits / total).toFixed(4)),
      cacheHitRate: Number((this.inMemoryStats.cacheHits / total).toFixed(4)),
      negativeCacheHitRate: Number((this.inMemoryStats.negativeCacheHits / total).toFixed(4)),
      providerHitRate: Number((this.inMemoryStats.providerHits / total).toFixed(4)),
      providerMissRate: Number((this.inMemoryStats.providerMisses / total).toFixed(4)),
      providerErrorRate: Number((this.inMemoryStats.providerErrors / total).toFixed(4)),
      averageLatencyMs: Math.round(this.inMemoryStats.totalLatencyMs / total),
    };
  }

  resetStats() {
    this.inMemoryStats = {
      localHits: 0,
      globalCatalogHits: 0,
      cacheHits: 0,
      negativeCacheHits: 0,
      providerHits: 0,
      providerMisses: 0,
      providerErrors: 0,
      totalLatencyMs: 0,
      totalAttempts: 0,
    };
  }
}

export const telemetryService = new IdentificationTelemetryService();
