// Unit & Integration tests for Milestone 1 Product Master & Prioritized Search
import { prisma } from '../../src/shared/database/prisma';
import { createProduct, searchProductsPrioritized, findProductByBarcode } from '../../src/modules/products/service';
import { ConflictError, ValidationError } from '../../src/shared/types/errors';

function randomString(prefix: string) {
  return `${prefix}-${Math.random().toString(36).substring(2, 9)}`;
}

describe('Milestone 1: Product Master & Store-Scoped Unique Barcode', () => {
  let storeAId: string;
  let storeBId: string;

  beforeAll(async () => {
    const storeA = await prisma.store.create({
      data: { name: 'Store A', gstin: '27AAAAA0000A1Z1', address: 'Addr A', city: 'Mumbai', state: 'MH', pincode: '400001' },
    });
    const storeB = await prisma.store.create({
      data: { name: 'Store B', gstin: '27AAAAA0000A1Z2', address: 'Addr B', city: 'Pune', state: 'MH', pincode: '411001' },
    });
    storeAId = storeA.id;
    storeBId = storeB.id;
  });

  afterAll(async () => {
    await prisma.invoiceItem.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.stockMovement.deleteMany();
    await prisma.batch.deleteMany();
    await prisma.product.deleteMany();
    await prisma.creditLedgerEntry.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.syncLog.deleteMany();
    await prisma.supplier.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await prisma.store.deleteMany();
    await prisma.$disconnect();
  });

  it('should create product with complete product master fields', async () => {
    const sku = randomString('SKU');
    const barcode = randomString('BAR');
    const product = await createProduct({
      storeId: storeAId,
      sku,
      barcode,
      name: 'Amul Butter 500g',
      brand: 'Amul',
      category: 'Dairy',
      variant: '500g Pack',
      packSize: '500g',
      unit: 'PACK',
      mrp: 275,
      sellingPrice: 260,
      purchasePrice: 240,
      gstRate: 12,
      taxType: 'GST',
      currentStock: 50,
      identificationSource: 'LOCAL_DB',
      verificationStatus: 'VERIFIED_EXTERNAL',
    });

    expect(product.id).toBeDefined();
    expect(product.brand).toBe('Amul');
    expect(product.variant).toBe('500g Pack');
    expect(product.packSize).toBe('500g');
    expect(product.mrp).toBe(275);
    expect(product.sellingPrice).toBe(260);
    expect(product.purchasePrice).toBe(240);
    expect(product.identificationSource).toBe('LOCAL_DB');
    expect(product.verificationStatus).toBe('VERIFIED_EXTERNAL');
  });

  it('should enforce sellingPrice <= MRP validation', async () => {
    await expect(
      createProduct({
        storeId: storeAId,
        sku: randomString('SKU'),
        name: 'Invalid Pricing Product',
        mrp: 100,
        sellingPrice: 120, // Exceeds MRP
        purchasePrice: 80,
      })
    ).rejects.toThrow('Validation failed');
  });

  it('should enforce store-scoped barcode uniqueness (Store A + Barcode X twice fails, Store B + Barcode X succeeds)', async () => {
    const sharedBarcode = randomString('SHARED-BAR');

    // Store A creates Product 1 with sharedBarcode
    const prodA = await createProduct({
      storeId: storeAId,
      sku: randomString('SKU-A1'),
      barcode: sharedBarcode,
      name: 'Store A Product',
      mrp: 100,
      sellingPrice: 90,
      purchasePrice: 70,
    });
    expect(prodA.barcode).toBe(sharedBarcode);

    // Store A attempts to create Product 2 with SAME barcode -> REJECTED
    await expect(
      createProduct({
        storeId: storeAId,
        sku: randomString('SKU-A2'),
        barcode: sharedBarcode,
        name: 'Store A Duplicate Barcode',
        mrp: 100,
        sellingPrice: 90,
        purchasePrice: 70,
      })
    ).rejects.toThrow(/already exists/);

    // Store B creates Product 1 with SAME barcode -> ALLOWED (store-scoped)
    const prodB = await createProduct({
      storeId: storeBId,
      sku: randomString('SKU-B1'),
      barcode: sharedBarcode,
      name: 'Store B Product Same Barcode',
      mrp: 100,
      sellingPrice: 90,
      purchasePrice: 70,
    });
    expect(prodB.barcode).toBe(sharedBarcode);
  });

  it('should allow multiple products with NULL / empty barcodes in same store', async () => {
    const prod1 = await createProduct({
      storeId: storeAId,
      sku: randomString('SKU-NOBAR1'),
      name: 'Loose Vegetable 1',
      mrp: 50,
      sellingPrice: 40,
      purchasePrice: 30,
    });

    const prod2 = await createProduct({
      storeId: storeAId,
      sku: randomString('SKU-NOBAR2'),
      name: 'Loose Vegetable 2',
      mrp: 60,
      sellingPrice: 50,
      purchasePrice: 40,
    });

    expect(prod1.barcode).toBeNull();
    expect(prod2.barcode).toBeNull();
  });
});

describe('Milestone 1: Prioritized Product Search Hierarchy', () => {
  let storeId: string;
  let barcodeProd: any;
  let skuProd: any;
  let exactNameProd: any;
  let prefixProd: any;
  let brandProd: any;

  beforeAll(async () => {
    const store = await prisma.store.create({
      data: { name: 'Search Store', gstin: '27AAAAA0000A1Z3', address: 'Addr', city: 'Mumbai', state: 'MH', pincode: '400001' },
    });
    storeId = store.id;

    barcodeProd = await createProduct({
      storeId,
      sku: 'SKU-TARGET-BARCODE',
      barcode: '8901001112233',
      name: 'Britannia Good Day Biscuits',
      brand: 'Britannia',
      category: 'Biscuits',
      mrp: 30,
      sellingPrice: 28,
      purchasePrice: 22,
    });

    skuProd = await createProduct({
      storeId,
      sku: 'SKU-UNIQUE-MATCH',
      name: 'Maggi 2-Min Noodles',
      brand: 'Nestle',
      category: 'Instant Food',
      mrp: 14,
      sellingPrice: 14,
      purchasePrice: 11,
    });

    exactNameProd = await createProduct({
      storeId,
      sku: 'SKU-EXACT-NAME',
      name: 'Tata Salt 1kg',
      brand: 'Tata',
      category: 'Grocery',
      mrp: 28,
      sellingPrice: 26,
      purchasePrice: 20,
    });

    prefixProd = await createProduct({
      storeId,
      sku: 'SKU-PREFIX',
      name: 'Tata Tea Gold 250g',
      brand: 'Tata',
      category: 'Tea',
      mrp: 160,
      sellingPrice: 150,
      purchasePrice: 130,
    });

    brandProd = await createProduct({
      storeId,
      sku: 'SKU-BRAND',
      name: 'Premium Basmati Rice',
      brand: 'Fortune',
      category: 'Staples',
      mrp: 200,
      sellingPrice: 180,
      purchasePrice: 150,
    });
  });

  afterAll(async () => {
    await prisma.invoiceItem.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.stockMovement.deleteMany();
    await prisma.batch.deleteMany();
    await prisma.product.deleteMany();
    await prisma.creditLedgerEntry.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.syncLog.deleteMany();
    await prisma.supplier.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await prisma.store.deleteMany();
    await prisma.$disconnect();
  });

  it('1. Priority 1: Exact Barcode match returns immediately', async () => {
    const results = await searchProductsPrioritized(storeId, '8901001112233');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(barcodeProd.id);
  });

  it('2. Priority 2: Exact SKU match returns immediately', async () => {
    const results = await searchProductsPrioritized(storeId, 'SKU-UNIQUE-MATCH');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(skuProd.id);
  });

  it('3. Priority 3: Exact Name match returns exact match', async () => {
    const results = await searchProductsPrioritized(storeId, 'Tata Salt 1kg');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(exactNameProd.id);
  });

  it('4. Priority 4: Prefix Name match returns matching items', async () => {
    const results = await searchProductsPrioritized(storeId, 'Tata Tea');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(prefixProd.id);
  });

  it('5. Priority 5: Brand / Category search matches brand', async () => {
    const results = await searchProductsPrioritized(storeId, 'Fortune');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(brandProd.id);
  });
});
