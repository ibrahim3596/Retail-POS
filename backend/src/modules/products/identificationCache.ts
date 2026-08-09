// Tiered Identification Cache with Positive (24h) and Negative (5m) TTL
import { ProductIdentificationCandidate } from './providers/interface';

export interface CacheEntry<T> {
  data: T;
  isNegative: boolean;
  expiresAt: number;
  providerName?: string;
}

export class IdentificationCacheManager {
  private cache = new Map<string, CacheEntry<any>>();
  private defaultPositiveTtlMs = 24 * 60 * 60 * 1000; // 24 hours
  private defaultNegativeTtlMs = 5 * 60 * 1000;      // 5 minutes

  private stats = {
    positiveHits: 0,
    negativeHits: 0,
    misses: 0,
  };

  constructor(positiveTtlMs?: number, negativeTtlMs?: number) {
    if (positiveTtlMs) this.defaultPositiveTtlMs = positiveTtlMs;
    if (negativeTtlMs) this.defaultNegativeTtlMs = negativeTtlMs;
  }

  /**
   * Get cached candidate or negative lookup result
   */
  get(gtin: string): { candidate: ProductIdentificationCandidate | null; isNegative: boolean } | null {
    const entry = this.cache.get(gtin);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(gtin);
      this.stats.misses++;
      return null;
    }

    if (entry.isNegative) {
      this.stats.negativeHits++;
      return { candidate: null, isNegative: true };
    }

    this.stats.positiveHits++;
    return { candidate: entry.data, isNegative: false };
  }

  /**
   * Store positive identification candidate in cache
   */
  setPositive(gtin: string, candidate: ProductIdentificationCandidate, ttlMs?: number): void {
    const expiresAt = Date.now() + (ttlMs || this.defaultPositiveTtlMs);
    this.cache.set(gtin, {
      data: candidate,
      isNegative: false,
      expiresAt,
      providerName: candidate.providerName,
    });
  }

  /**
   * Store negative lookup result (NOT_FOUND) in cache to prevent provider hammering
   */
  setNegative(gtin: string, providerName?: string, ttlMs?: number): void {
    const expiresAt = Date.now() + (ttlMs || this.defaultNegativeTtlMs);
    this.cache.set(gtin, {
      data: null,
      isNegative: true,
      expiresAt,
      providerName,
    });
  }

  /**
   * Invalidate a cached GTIN
   */
  invalidate(gtin: string): void {
    this.cache.delete(gtin);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.stats = { positiveHits: 0, negativeHits: 0, misses: 0 };
  }

  /**
   * Get cache telemetry stats
   */
  getStats() {
    return {
      ...this.stats,
      totalEntries: this.cache.size,
    };
  }
}

export const identificationCache = new IdentificationCacheManager();
