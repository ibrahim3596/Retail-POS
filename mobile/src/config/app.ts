// Mobile app configuration
export const APP_CONFIG = {
  API_BASE_URL: __DEV__ ? 'http://10.0.2.2:3000/api' : 'https://your-api-domain.com/api',
  SYNC_INTERVAL_MS: 30000, // Auto-sync every 30 seconds when online
  SYNC_BATCH_SIZE: 50,
  OFFLINE_DB_NAME: 'retailpos.db',
  OFFLINE_DB_VERSION: '1.0',
  OFFLINE_DB_DISPLAY_NAME: 'RetailPOS Offline DB',
  OFFLINE_DB_SIZE: 50 * 1024 * 1024, // 50MB
  BARCODE_DEBOUNCE_MS: 500,
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 1000,
} as const;

// Error messages for user-facing errors
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'No internet connection. Data will be saved offline and synced later.',
  INVALID_BARCODE: 'Product not found for this barcode.',
  INSUFFICIENT_STOCK: 'Insufficient stock available.',
  INVALID_QUANTITY: 'Please enter a valid quantity.',
  SYNC_FAILED: 'Sync failed. Will retry automatically.',
  AUTH_FAILED: 'Authentication failed. Please login again.',
  INVALID_INPUT: 'Please check your input and try again.',
} as const;
