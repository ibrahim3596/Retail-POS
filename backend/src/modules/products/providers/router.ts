// External Provider Router & Resilience Orchestrator
import { ProductProvider, ProductIdentificationCandidate } from './interface';
import { normalizeBarcode } from '../barcodeNormalizer';
import { identificationCache } from '../identificationCache';
import { globalProductCatalog } from '../globalCatalog';
import { telemetryService } from '../telemetry';

export interface CircuitBreakerState {
  status: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  lastFailureTime?: number;
}

export class ExternalProviderRouter {
  private providers: ProductProvider[] = [];
  private circuitBreakers = new Map<string, CircuitBreakerState>();
  private inFlightLookups = new Map<string, Promise<ProductIdentificationCandidate | null>>();

  private failureThreshold = 3;
  private cooldownMs = 5 * 60 * 1000; // 5 minutes circuit breaker cooldown

  /**
   * Register a new external product provider
   */
  registerProvider(provider: ProductProvider): void {
    this.providers = this.providers.filter((p) => p.name !== provider.name);
    this.providers.push(provider);
    this.providers.sort((a, b) => b.priority - a.priority); // Highest priority first
    this.circuitBreakers.set(provider.name, { status: 'CLOSED', failureCount: 0 });
  }

  /**
   * Remove or disable a provider
   */
  unregisterProvider(name: string): void {
    this.providers = this.providers.filter((p) => p.name !== name);
    this.circuitBreakers.delete(name);
  }

  getRegisteredProviders(): ProductProvider[] {
    return [...this.providers];
  }

  /**
   * Get active circuit breaker status for a provider
   */
  getCircuitBreakerState(name: string): CircuitBreakerState {
    const cb = this.circuitBreakers.get(name);
    if (!cb) return { status: 'CLOSED', failureCount: 0 };

    if (cb.status === 'OPEN' && cb.lastFailureTime) {
      if (Date.now() - cb.lastFailureTime > this.cooldownMs) {
        cb.status = 'HALF_OPEN';
      }
    }

    return cb;
  }

  private recordSuccess(providerName: string): void {
    this.circuitBreakers.set(providerName, { status: 'CLOSED', failureCount: 0 });
  }

  private recordFailure(providerName: string): void {
    const cb = this.getCircuitBreakerState(providerName);
    const failureCount = cb.failureCount + 1;
    const status = failureCount >= this.failureThreshold ? 'OPEN' : 'CLOSED';
    this.circuitBreakers.set(providerName, {
      status,
      failureCount,
      lastFailureTime: Date.now(),
    });
    telemetryService.recordProviderError();
  }

  /**
   * Master Identification Method for Barcode Resolution Cascade:
   * 1. Normalized GTIN check
   * 2. Cache check (Positive / Negative)
   * 3. Global Catalog check
   * 4. External Provider Priority Chain with Circuit Breakers & Request Deduplication
   */
  async identifyProductByBarcode(
    storeId: string,
    rawBarcode: string
  ): Promise<{ status: 'FOUND' | 'NOT_FOUND'; candidate: ProductIdentificationCandidate | null; source: string }> {
    const startTime = Date.now();
    const normalized = normalizeBarcode(rawBarcode);
    const gtin = normalized.canonicalGtin || normalized.sanitizedInput;

    if (!gtin) {
      return { status: 'NOT_FOUND', candidate: null, source: 'INVALID_BARCODE' };
    }

    // 1. Check Tier 1 Cache (Positive 24h & Negative 5m)
    const cached = identificationCache.get(gtin);
    if (cached) {
      if (cached.isNegative) {
        telemetryService.recordNegativeCacheHit();
        await telemetryService.logAttempt({
          storeId,
          rawBarcode,
          normalizedBarcode: gtin,
          attemptType: 'CACHE',
          latencyMs: Date.now() - startTime,
          success: false,
        });
        return { status: 'NOT_FOUND', candidate: null, source: 'NEGATIVE_CACHE' };
      }

      await telemetryService.logAttempt({
        storeId,
        rawBarcode,
        normalizedBarcode: gtin,
        attemptType: 'CACHE',
        latencyMs: Date.now() - startTime,
        success: true,
        providerUsed: cached.candidate?.providerName,
      });
      return { status: 'FOUND', candidate: cached.candidate, source: 'CACHE' };
    }

    // 2. Check Tier 2 Global Product Catalog
    const globalMatch = await globalProductCatalog.findByGtin(gtin);
    if (globalMatch) {
      identificationCache.setPositive(gtin, globalMatch);
      await telemetryService.logAttempt({
        storeId,
        rawBarcode,
        normalizedBarcode: gtin,
        attemptType: 'GLOBAL_CATALOG',
        latencyMs: Date.now() - startTime,
        success: true,
        providerUsed: 'GLOBAL_CATALOG',
      });
      return { status: 'FOUND', candidate: globalMatch, source: 'GLOBAL_CATALOG' };
    }

    // 3. Check for in-flight deduplicated request
    let inFlight = this.inFlightLookups.get(gtin);
    if (inFlight) {
      const candidate = await inFlight;
      const duration = Date.now() - startTime;
      if (candidate) {
        return { status: 'FOUND', candidate, source: 'DEDUPLICATED_REQUEST' };
      }
      return { status: 'NOT_FOUND', candidate: null, source: 'DEDUPLICATED_REQUEST' };
    }

    // 4. Create deduplicated in-flight lookup promise for external providers
    const lookupPromise = (async (): Promise<ProductIdentificationCandidate | null> => {
      const eligibleProviders = this.providers.filter((p) => {
        if (!p.isEnabled) return false;
        const cb = this.getCircuitBreakerState(p.name);
        return cb.status !== 'OPEN';
      });

      for (const provider of eligibleProviders) {
        try {
          const result = await provider.lookupByBarcode(gtin);
          if (result && result.name) {
            this.recordSuccess(provider.name);
            // Save to positive cache & global product catalog asynchronously
            identificationCache.setPositive(gtin, result);
            globalProductCatalog.upsertFromCandidate(result).catch(() => {});
            
            await telemetryService.logAttempt({
              storeId,
              rawBarcode,
              normalizedBarcode: gtin,
              attemptType: 'EXTERNAL_PROVIDER',
              providerUsed: provider.name,
              latencyMs: Date.now() - startTime,
              success: true,
            });
            return result;
          }
        } catch {
          this.recordFailure(provider.name);
        }
      }

      // If all providers miss or fail, store negative cache entry
      identificationCache.setNegative(gtin, 'ALL_PROVIDERS_MISS');
      await telemetryService.logAttempt({
        storeId,
        rawBarcode,
        normalizedBarcode: gtin,
        attemptType: 'EXTERNAL_PROVIDER',
        latencyMs: Date.now() - startTime,
        success: false,
      });

      return null;
    })();

    this.inFlightLookups.set(gtin, lookupPromise);

    try {
      const candidate = await lookupPromise;
      if (candidate) {
        return { status: 'FOUND', candidate, source: 'EXTERNAL_PROVIDER' };
      }
      return { status: 'NOT_FOUND', candidate: null, source: 'NONE' };
    } finally {
      this.inFlightLookups.delete(gtin);
    }
  }
}

export const providerRouter = new ExternalProviderRouter();
