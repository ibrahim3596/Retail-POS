// Open Food Facts External Provider Adapter
import axios from 'axios';
import { ProductProvider, ProductIdentificationCandidate } from './interface';

export class OpenFoodFactsProvider implements ProductProvider {
  name = 'OPEN_FOOD_FACTS';
  priority = 50; // Standard priority
  isEnabled = true;
  private timeoutMs = 2500; // 2.5 seconds timeout

  async isHealthy(): Promise<boolean> {
    try {
      const res = await axios.get('https://world.openfoodfacts.org/api/v2/product/8901030889123.json', {
        timeout: 1500,
      });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  async lookupByBarcode(gtin: string): Promise<ProductIdentificationCandidate | null> {
    if (!this.isEnabled) return null;

    // Strip leading zeros for Open Food Facts query if needed, or query standard barcode
    const rawDigits = gtin.replace(/^0+/, '');

    try {
      const url = `https://world.openfoodfacts.org/api/v2/product/${rawDigits || gtin}.json`;
      const response = await axios.get(url, {
        timeout: this.timeoutMs,
        headers: { 'User-Agent': 'RetailPOS-India/1.0 (retailpos-support@store.in)' },
      });

      if (response.data?.status !== 1 || !response.data?.product) {
        return null; // Product not found in Open Food Facts
      }

      const p = response.data.product;
      const productName = p.product_name || p.product_name_en || p.product_name_hi;

      if (!productName || typeof productName !== 'string' || !productName.trim()) {
        return null;
      }

      return {
        rawBarcode: gtin,
        canonicalGtin: gtin,
        name: productName.trim(),
        brand: p.brands ? p.brands.split(',')[0].trim() : null,
        category: p.categories ? p.categories.split(',')[0].trim() : null,
        packSize: p.quantity || p.net_weight_value ? `${p.net_weight_value || ''}${p.net_weight_unit || ''}` : null,
        unit: 'PCS',
        suggestedMrp: null, // Open Food Facts does not reliably store Indian MRP
        suggestedGstRate: null,
        suggestedHsnCode: null,
        imageUrl: p.image_front_url || p.image_url || null,
        providerName: this.name,
        dataSource: 'OPEN_FOOD_FACTS',
        confidence: 0.85,
        rawResponseRef: { status: response.data.status, code: response.data.code },
      };
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      // Re-throw timeouts, 429 rate limits, and 5xx errors for circuit breaker tracking
      throw error;
    }
  }

  async searchProduct(query: string): Promise<ProductIdentificationCandidate[]> {
    if (!this.isEnabled) return [];
    try {
      const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1`;
      const response = await axios.get(url, { timeout: 3000 });

      if (!response.data?.products || !Array.isArray(response.data.products)) {
        return [];
      }

      return response.data.products
        .filter((p: any) => p.product_name)
        .slice(0, 10)
        .map((p: any) => ({
          rawBarcode: p.code || '',
          canonicalGtin: (p.code || '').padStart(14, '0'),
          name: p.product_name.trim(),
          brand: p.brands ? p.brands.split(',')[0].trim() : null,
          category: p.categories ? p.categories.split(',')[0].trim() : null,
          packSize: p.quantity || null,
          unit: 'PCS',
          imageUrl: p.image_front_url || null,
          providerName: this.name,
          dataSource: 'OPEN_FOOD_FACTS',
          confidence: 0.80,
        }));
    } catch {
      return [];
    }
  }
}
