// Unit tests for Product Alias & Cross-Table Barcode Collision Domain
import { prisma } from '../../src/shared/database/prisma';
import { createProduct, addProductAlias, findProductByBarcode } from '../../src/modules/products/service';
import { ConflictError } from '../../src/shared/types/errors';

function randomString(prefix: string) {
  return `${prefix}-${Math.random().toString(36).substring(2, 9)}`;
}

describe('Phase 2B Milestone 1: Primary Barcode + Alias Collision Domain', () => {
  let storeAId: string;
  let storeBId: string;

  beforeAll(async () => {
    const storeA = await prisma.store.create({
      data: { name: 'Collision Store A', gstin: '27AAAAA0000A1Z5', address: 'Addr A', city: 'Mumbai', state: 'MH', pincode: '400001' },
    });
    const storeB = await prisma.store.create({
      data: { name: 'Collision Store B', gstin: '27AAAAA0000A1Z6', address: 'Addr B', city: 'Pune', state: 'MH', pincode: '411001' },
    });
    storeAId = storeA.id;
    storeBId = storeB.id;
  });

  afterAll(async () => {
    await prisma.productAlias.deleteMany();
    await prisma.stockMovement.deleteMany();
    await prisma.product.deleteMany();
    await prisma.store.deleteMany();
    await prisma.$disconnect();
  });

  it('1. Rejects creation of Product B when primary barcode collides with Product A primary barcode in Store A', async () => {
    const sharedBarcode = '8901001112233'; // Valid EAN-13

    await createProduct({
      storeId: storeAId,
      sku: randomString('SKU-P1'),
      barcode: sharedBarcode,
      name: 'Product 1 Primary',
      mrp: 50,
      sellingPrice: 45,
      purchasePrice: 35,
    });

    await expect(
      createProduct({
        storeId: storeAId,
        sku: randomString('SKU-P2'),
        barcode: sharedBarcode,
        name: 'Product 2 Primary Duplicate',
        mrp: 50,
        sellingPrice: 45,
        purchasePrice: 35,
      })
    ).rejects.toThrow(/already exists/);
  });

  it('2. Rejects adding alias X to Product B when X is Product A primary barcode in Store A', async () => {
    const primaryBarcode = randomString('BAR-PRIMARY');

    await createProduct({
      storeId: storeAId,
      sku: randomString('SKU-A1'),
      barcode: primaryBarcode,
      name: 'Product A With Primary Barcode',
      mrp: 100,
      sellingPrice: 90,
      purchasePrice: 70,
    });

    const prodB = await createProduct({
      storeId: storeAId,
      sku: randomString('SKU-B1'),
      name: 'Product B No Barcode',
      mrp: 100,
      sellingPrice: 90,
      purchasePrice: 70,
    });

    // Attempting to add primaryBarcode as alias on Product B -> REJECTED
    await expect(
      addProductAlias(storeAId, prodB.id, primaryBarcode)
    ).rejects.toThrow(/already exists/);
  });

  it('3. Rejects creating Product B with primary barcode X when X is already an alias on Product A in Store A', async () => {
    const aliasBarcode = randomString('BAR-ALIAS');

    const prodA = await createProduct({
      storeId: storeAId,
      sku: randomString('SKU-A2'),
      name: 'Product A For Alias',
      mrp: 80,
      sellingPrice: 70,
      purchasePrice: 50,
    });

    await addProductAlias(storeAId, prodA.id, aliasBarcode);

    // Attempting to create Product B with primary barcode = aliasBarcode -> REJECTED
    await expect(
      createProduct({
        storeId: storeAId,
        sku: randomString('SKU-B2'),
        barcode: aliasBarcode,
        name: 'Product B With Primary Colliding Alias',
        mrp: 80,
        sellingPrice: 70,
        purchasePrice: 50,
      })
    ).rejects.toThrow(/already exists/);
  });

  it('4. Rejects adding alias X to Product B when X is already an alias on Product A in Store A', async () => {
    const sharedAlias = randomString('SHARED-ALIAS');

    const prodA = await createProduct({
      storeId: storeAId,
      sku: randomString('SKU-A3'),
      name: 'Product A',
      mrp: 40,
      sellingPrice: 35,
      purchasePrice: 25,
    });

    const prodB = await createProduct({
      storeId: storeAId,
      sku: randomString('SKU-B3'),
      name: 'Product B',
      mrp: 40,
      sellingPrice: 35,
      purchasePrice: 25,
    });

    await addProductAlias(storeAId, prodA.id, sharedAlias);

    // Adding same alias to Product B -> REJECTED
    await expect(
      addProductAlias(storeAId, prodB.id, sharedAlias)
    ).rejects.toThrow(/already exists/);
  });

  it('5. Store Isolation: Store B can use barcode X as primary/alias even if used in Store A', async () => {
    const crossStoreBarcode = randomString('CROSS-STORE-BAR');

    await createProduct({
      storeId: storeAId,
      sku: randomString('SKU-STORE-A'),
      barcode: crossStoreBarcode,
      name: 'Store A Product',
      mrp: 100,
      sellingPrice: 90,
      purchasePrice: 70,
    });

    // Store B creates product with SAME barcode -> ALLOWED
    const prodB = await createProduct({
      storeId: storeBId,
      sku: randomString('SKU-STORE-B'),
      barcode: crossStoreBarcode,
      name: 'Store B Product Same Barcode',
      mrp: 100,
      sellingPrice: 90,
      purchasePrice: 70,
    });

    expect(prodB.barcode).toBe(crossStoreBarcode);
  });

  it('6. findProductByBarcode resolves both primary barcode and alias successfully', async () => {
    const primary = randomString('BAR-FIND-PRIM');
    const alias = randomString('BAR-FIND-ALIAS');

    const prod = await createProduct({
      storeId: storeAId,
      sku: randomString('SKU-FIND'),
      barcode: primary,
      name: 'Product To Find By Alias',
      mrp: 150,
      sellingPrice: 140,
      purchasePrice: 110,
    });

    await addProductAlias(storeAId, prod.id, alias);

    // Find by primary barcode
    const foundPrimary = await findProductByBarcode(storeAId, primary);
    expect(foundPrimary.id).toBe(prod.id);

    // Find by alias
    const foundAlias = await findProductByBarcode(storeAId, alias);
    expect(foundAlias.id).toBe(prod.id);
  });
});
