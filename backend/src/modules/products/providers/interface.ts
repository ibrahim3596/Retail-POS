// Product Provider Abstraction & Data Models for Phase 2B

export interface ProductIdentificationCandidate {
  rawBarcode: string;
  canonicalGtin: string;
  name: string;
  brand?: string | null;
  category?: string | null;
  variant?: string | null;
  packSize?: string | null;
  unit?: string;
  suggestedMrp?: number | null;
  suggestedGstRate?: number | null;
  suggestedHsnCode?: string | null;
  imageUrl?: string | null;
  providerName: string;
  dataSource: string;
  confidence: number;
  rawResponseRef?: Record<string, any>;
}

export interface ProductProviderConfig {
  name: string;
  priority: number;
  isEnabled: boolean;
  timeoutMs: number;
  maxRetries: number;
  rateLimitPerMinute: number;
  apiKey?: string;
}

export interface ProductProvider {
  name: string;
  priority: number;
  isEnabled: boolean;
  
  lookupByBarcode(gtin: string): Promise<ProductIdentificationCandidate | null>;
  searchProduct(query: string): Promise<ProductIdentificationCandidate[]>;
  isHealthy(): Promise<boolean>;
}
