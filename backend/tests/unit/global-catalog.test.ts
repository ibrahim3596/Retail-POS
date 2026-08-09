import { prisma } from '../../src/shared/database/prisma';
import { globalProductCatalog } from '../../src/modules/products/globalCatalog';

describe('Phase 2B Milestone 2: Global Product Catalog', () => {
  beforeAll(async () => {
    await prisma.globalProductCatalog.deleteMany();
  });

  afterAll(async () => {
    await prisma.globalProductCatalog.deleteMany();
    await prisma.$disconnect();
  });

  it('1. Successfully upserts and retrieves a shared global product candidate', async () => {
    const testGtin = '08901234567890';
    await globalProductCatalog.upsertFromCandidate({
      rawBarcode: testGtin,
      canonicalGtin: testGtin,
      name: 'Tata Tea Gold 500g',
      brand: 'Tata',
      category: 'Tea',
      packSize: '500g',
      suggestedMrp: 320,
      suggestedGstRate: 5,
      suggestedHsnCode: '0902',
      providerName: 'GS1_INDIA',
      dataSource: 'GS1_OFFICIAL',
      confidence: 0.98,
    });

    const result = await globalProductCatalog.findByGtin(testGtin);

    expect(result).not.toBeNull();
    expect(result?.name).toBe('Tata Tea Gold 500g');
    expect(result?.brand).toBe('Tata');
    expect(result?.suggestedMrp).toBe(320);
    expect(result?.suggestedGstRate).toBe(5);
    expect(result?.providerName).toBe('GLOBAL_CATALOG');
  });

  it('2. Global Product Catalog does NOT store or overwrite store-specific commercial pricing or inventory', async () => {
    const testGtin = '08909876543210';
    await globalProductCatalog.upsertFromCandidate({
      rawBarcode: testGtin,
      canonicalGtin: testGtin,
      name: 'Fortune Sunlite Sunflower Oil 1L',
      brand: 'Fortune',
      packSize: '1L',
      suggestedMrp: 165,
      providerName: 'OPEN_FOOD_FACTS',
      dataSource: 'OPEN_FOOD_FACTS',
      confidence: 0.90,
    });

    const dbRecord: any = await prisma.globalProductCatalog.findUnique({
      where: { gtin: testGtin },
    });

    expect(dbRecord).toBeDefined();
    expect(dbRecord.name).toBe('Fortune Sunlite Sunflower Oil 1L');
    expect(dbRecord.sellingPrice).toBeUndefined(); // Commercial store fields must NOT exist in GlobalProductCatalog
    expect(dbRecord.purchasePrice).toBeUndefined();
    expect(dbRecord.currentStock).toBeUndefined();
  });
});
