// Global Product Catalog Repository for Cross-Store Shared Product Identity
import { prisma } from '@shared/database/prisma';
import { ProductIdentificationCandidate } from './providers/interface';

export class GlobalProductCatalogRepository {
  /**
   * Find product in shared global catalog by GTIN
   */
  async findByGtin(gtin: string): Promise<ProductIdentificationCandidate | null> {
    const entry = await prisma.globalProductCatalog.findUnique({
      where: { gtin },
    });

    if (!entry) return null;

    return {
      rawBarcode: gtin,
      canonicalGtin: entry.gtin,
      name: entry.name,
      brand: entry.brand,
      category: entry.category,
      packSize: entry.packSize,
      suggestedMrp: entry.suggestedMrp ? Number(entry.suggestedMrp) : null,
      suggestedGstRate: entry.suggestedGstRate ? Number(entry.suggestedGstRate) : null,
      suggestedHsnCode: entry.suggestedHsnCode,
      imageUrl: entry.imageUrl,
      providerName: 'GLOBAL_CATALOG',
      dataSource: entry.dataSource,
      confidence: 0.98,
    };
  }

  /**
   * Save or increment verification count for a verified GTIN in global catalog
   */
  async upsertFromCandidate(candidate: ProductIdentificationCandidate): Promise<void> {
    if (!candidate.canonicalGtin || !candidate.name) return;

    await prisma.globalProductCatalog.upsert({
      where: { gtin: candidate.canonicalGtin },
      create: {
        gtin: candidate.canonicalGtin,
        name: candidate.name,
        brand: candidate.brand || null,
        category: candidate.category || null,
        packSize: candidate.packSize || null,
        suggestedMrp: candidate.suggestedMrp || null,
        suggestedGstRate: candidate.suggestedGstRate || null,
        suggestedHsnCode: candidate.suggestedHsnCode || null,
        imageUrl: candidate.imageUrl || null,
        dataSource: candidate.providerName,
        verificationCount: 1,
      },
      update: {
        name: candidate.name,
        brand: candidate.brand || undefined,
        category: candidate.category || undefined,
        packSize: candidate.packSize || undefined,
        suggestedMrp: candidate.suggestedMrp || undefined,
        suggestedGstRate: candidate.suggestedGstRate || undefined,
        suggestedHsnCode: candidate.suggestedHsnCode || undefined,
        imageUrl: candidate.imageUrl || undefined,
        verificationCount: { increment: 1 },
      },
    });
  }
}

export const globalProductCatalog = new GlobalProductCatalogRepository();
