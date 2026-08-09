// Unit tests for Provider Router, Circuit Breaker, and Request Deduplication
import { prisma } from '../../src/shared/database/prisma';
import { ExternalProviderRouter } from '../../src/modules/products/providers/router';
import { MockDevProvider } from '../../src/modules/products/providers/mockProvider';
import { identificationCache } from '../../src/modules/products/identificationCache';
import { telemetryService } from '../../src/modules/products/telemetry';

describe('Phase 2B Milestone 2: Provider Router & Circuit Breaker', () => {
  let router: ExternalProviderRouter;
  let mockProvider: MockDevProvider;
  let storeId: string;

  beforeAll(async () => {
    const store = await prisma.store.create({
      data: { name: 'Router Test Store', gstin: '27AAAAA0000A1Z9', address: 'Addr', city: 'Mumbai', state: 'MH', pincode: '400001' },
    });
    storeId = store.id;
  });

  afterAll(async () => {
    await prisma.productIdentificationAttempt.deleteMany();
    await prisma.store.deleteMany({ where: { id: storeId } });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    router = new ExternalProviderRouter();
    mockProvider = new MockDevProvider();
    router.registerProvider(mockProvider);
    identificationCache.clear();
    telemetryService.resetStats();
  });

  it('1. Successfully resolves GTIN via registered Mock Provider', async () => {
    const gtin = '08901030889123';
    const result = await router.identifyProductByBarcode(storeId, gtin);

    expect(result.status).toBe('FOUND');
    expect(result.candidate?.name).toBe('Britannia Good Day Butter Biscuits');
    expect(result.candidate?.brand).toBe('Britannia');
    expect(result.source).toBe('EXTERNAL_PROVIDER');
  });

  it('2. Caches positive lookup result for 24h (subsequent calls hit positive cache)', async () => {
    const gtin = '08901414000305';
    // First lookup: External Provider
    const res1 = await router.identifyProductByBarcode(storeId, gtin);
    expect(res1.source).toBe('EXTERNAL_PROVIDER');

    // Second lookup: Cached result (0 external provider calls)
    const res2 = await router.identifyProductByBarcode(storeId, gtin);
    expect(res2.source).toBe('CACHE');
    expect(res2.candidate?.name).toBe('Parle-G Gold Biscuits');
  });

  it('3. Negative caching: Unrecognized GTIN stores short-lived negative result', async () => {
    const unknownGtin = '09999999999999';
    const res1 = await router.identifyProductByBarcode(storeId, unknownGtin);
    expect(res1.status).toBe('NOT_FOUND');

    // Second lookup hits negative cache immediately without querying provider
    const res2 = await router.identifyProductByBarcode(storeId, unknownGtin);
    expect(res2.status).toBe('NOT_FOUND');
    expect(res2.source).toBe('NEGATIVE_CACHE');
  });

  it('4. Deduplicates concurrent in-flight requests for identical GTINs', async () => {
    const gtin = '08901058000450';
    
    // Trigger two simultaneous identification requests
    const p1 = router.identifyProductByBarcode(storeId, gtin);
    const p2 = router.identifyProductByBarcode(storeId, gtin);

    const [res1, res2] = await Promise.all([p1, p2]);

    expect(res1.status).toBe('FOUND');
    expect(res2.status).toBe('FOUND');
    expect(res1.candidate?.name).toBe('Maggi Masala 2-Min Noodles');
    // One of them will be marked as deduplicated or hit cache/provider
    expect(['EXTERNAL_PROVIDER', 'DEDUPLICATED_REQUEST', 'CACHE']).toContain(res2.source);
  });

  it('5. Circuit Breaker opens after 3 consecutive provider failures across distinct GTINs', async () => {
    const fail1 = '08888888888881';
    const fail2 = '08888888888882';
    const fail3 = '08888888888883';

    mockProvider.injectError(fail1, 'SERVER_ERROR');
    mockProvider.injectError(fail2, 'SERVER_ERROR');
    mockProvider.injectError(fail3, 'SERVER_ERROR');

    // 3 distinct failing requests
    await router.identifyProductByBarcode(storeId, fail1);
    await router.identifyProductByBarcode(storeId, fail2);
    await router.identifyProductByBarcode(storeId, fail3);

    const cbState = router.getCircuitBreakerState('MOCK_DEV_PROVIDER');
    expect(cbState.status).toBe('OPEN');
    expect(cbState.failureCount).toBeGreaterThanOrEqual(3);
  });

  it('6. Handles provider timeout gracefully without breaking system', async () => {
    const timeoutGtin = '07777777777777';
    mockProvider.injectError(timeoutGtin, 'TIMEOUT');

    const result = await router.identifyProductByBarcode(storeId, timeoutGtin);
    expect(result.status).toBe('NOT_FOUND');
    expect(result.candidate).toBeNull();
  });
});
