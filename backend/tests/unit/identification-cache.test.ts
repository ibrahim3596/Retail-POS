import { IdentificationCacheManager } from '../../src/modules/products/identificationCache';

describe('Phase 2B Milestone 2: Identification Cache & Negative Cache', () => {
  let cache: IdentificationCacheManager;

  beforeEach(() => {
    // 500ms positive TTL, 100ms negative TTL for test speed
    cache = new IdentificationCacheManager(500, 100);
  });

  it('1. Stores and retrieves positive candidate until TTL expires', async () => {
    const candidate = {
      rawBarcode: '08901000111222',
      canonicalGtin: '08901000111222',
      name: 'Test Biscuit',
      providerName: 'MOCK_DEV',
      dataSource: 'MOCK',
      confidence: 0.9,
    };

    cache.setPositive('08901000111222', candidate);

    const hit = cache.get('08901000111222');
    expect(hit).not.toBeNull();
    expect(hit?.isNegative).toBe(false);
    expect(hit?.candidate?.name).toBe('Test Biscuit');

    // Wait for TTL expiration
    await new Promise((res) => setTimeout(res, 600));

    const expired = cache.get('08901000111222');
    expect(expired).toBeNull();
  });

  it('2. Stores and retrieves negative lookup result (NOT_FOUND) until TTL expires', async () => {
    cache.setNegative('09999999999999', 'OPEN_FOOD_FACTS');

    const hit = cache.get('09999999999999');
    expect(hit).not.toBeNull();
    expect(hit?.isNegative).toBe(true);
    expect(hit?.candidate).toBeNull();

    // Wait for negative TTL expiration
    await new Promise((res) => setTimeout(res, 150));

    const expired = cache.get('09999999999999');
    expect(expired).toBeNull();
  });

  it('3. Cache stats accurately reflect hits, negative hits, and misses', () => {
    cache.setPositive('111', { name: 'P1' } as any);
    cache.setNegative('222');

    cache.get('111'); // positive hit
    cache.get('222'); // negative hit
    cache.get('333'); // miss

    const stats = cache.getStats();
    expect(stats.positiveHits).toBe(1);
    expect(stats.negativeHits).toBe(1);
    expect(stats.misses).toBe(1);
  });
});
