// Development Mock Provider Stub for Offline Testing & Circuit Breaker Verification
import { ProductProvider, ProductIdentificationCandidate } from './interface';

export class MockDevProvider implements ProductProvider {
  name = 'MOCK_DEV_PROVIDER';
  priority = 10; // High priority for dev testing
  isEnabled = true;

  private mockCatalog: Record<string, Partial<ProductIdentificationCandidate>> = {
    '08901030889123': {
      name: 'Britannia Good Day Butter Biscuits',
      brand: 'Britannia',
      category: 'Biscuits',
      packSize: '100g',
      suggestedMrp: 30.0,
      suggestedGstRate: 18.0,
      suggestedHsnCode: '1905',
    },
    '08901414000305': {
      name: 'Parle-G Gold Biscuits',
      brand: 'Parle',
      category: 'Biscuits',
      packSize: '80g',
      suggestedMrp: 10.0,
      suggestedGstRate: 18.0,
      suggestedHsnCode: '1905',
    },
    '08901058000450': {
      name: 'Maggi Masala 2-Min Noodles',
      brand: 'Nestle',
      category: 'Instant Food',
      packSize: '70g',
      suggestedMrp: 14.0,
      suggestedGstRate: 12.0,
      suggestedHsnCode: '1902',
    },
  };

  private errorInjectMap: Record<string, 'TIMEOUT' | 'RATE_LIMIT' | 'SERVER_ERROR'> = {};

  injectError(gtin: string, errorType: 'TIMEOUT' | 'RATE_LIMIT' | 'SERVER_ERROR') {
    this.errorInjectMap[gtin] = errorType;
  }

  clearInjectedErrors() {
    this.errorInjectMap = {};
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  async lookupByBarcode(gtin: string): Promise<ProductIdentificationCandidate | null> {
    if (!this.isEnabled) return null;

    // Simulate error injections for testing
    if (this.errorInjectMap[gtin]) {
      const errType = this.errorInjectMap[gtin];
      if (errType === 'TIMEOUT') {
        await new Promise((res) => setTimeout(res, 3000));
        throw new Error('Provider request timed out');
      }
      if (errType === 'RATE_LIMIT') {
        const err: any = new Error('Rate limit exceeded');
        err.status = 429;
        throw err;
      }
      if (errType === 'SERVER_ERROR') {
        const err: any = new Error('Internal provider error');
        err.status = 500;
        throw err;
      }
    }

    const item = this.mockCatalog[gtin];
    if (!item) return null;

    return {
      rawBarcode: gtin,
      canonicalGtin: gtin,
      name: item.name!,
      brand: item.brand,
      category: item.category,
      packSize: item.packSize,
      unit: 'PCS',
      suggestedMrp: item.suggestedMrp,
      suggestedGstRate: item.suggestedGstRate,
      suggestedHsnCode: item.suggestedHsnCode,
      providerName: this.name,
      dataSource: 'MOCK_STORE_STUB',
      confidence: 0.95,
    };
  }

  async searchProduct(query: string): Promise<ProductIdentificationCandidate[]> {
    if (!this.isEnabled) return [];
    const results: ProductIdentificationCandidate[] = [];

    for (const [gtin, item] of Object.entries(this.mockCatalog)) {
      if (item.name?.toLowerCase().includes(query.toLowerCase())) {
        results.push({
          rawBarcode: gtin,
          canonicalGtin: gtin,
          name: item.name,
          brand: item.brand,
          category: item.category,
          packSize: item.packSize,
          unit: 'PCS',
          suggestedMrp: item.suggestedMrp,
          suggestedGstRate: item.suggestedGstRate,
          suggestedHsnCode: item.suggestedHsnCode,
          providerName: this.name,
          dataSource: 'MOCK_STORE_STUB',
          confidence: 0.95,
        });
      }
    }
    return results;
  }
}
