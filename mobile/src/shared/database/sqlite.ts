// Offline database manager using SQLite
import SQLite from 'react-native-sqlite-storage';
import { APP_CONFIG } from '../../config/app';

SQLite.enablePromise(true);

let db: SQLite.SQLiteDatabase | null = null;

/**
 * Initialize offline database with schema
 */
export async function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;

  db = await SQLite.openDatabase({
    name: APP_CONFIG.OFFLINE_DB_NAME,
    location: 'default',
  });

  // Create tables for offline storage
  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL,
      sku TEXT NOT NULL,
      barcode TEXT,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT,
      hsn_code TEXT,
      unit TEXT DEFAULT 'PCS',
      mrp REAL NOT NULL,
      selling_price REAL NOT NULL,
      purchase_price REAL NOT NULL,
      gst_rate REAL DEFAULT 18,
      tax_type TEXT DEFAULT 'GST',
      current_stock REAL DEFAULT 0,
      min_stock REAL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      synced_at TEXT
    )
  `);

  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      gstin TEXT,
      address TEXT,
      credit_limit REAL DEFAULT 0,
      balance REAL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      synced_at TEXT
    )
  `);

  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      local_id TEXT NOT NULL,
      invoice_number TEXT,
      store_id TEXT NOT NULL,
      customer_id TEXT,
      subtotal REAL NOT NULL,
      discount_amount REAL DEFAULT 0,
      discount_percent REAL DEFAULT 0,
      cgst_amount REAL DEFAULT 0,
      sgst_amount REAL DEFAULT 0,
      igst_amount REAL DEFAULT 0,
      total_tax REAL DEFAULT 0,
      round_off REAL DEFAULT 0,
      grand_total REAL NOT NULL,
      amount_paid REAL DEFAULT 0,
      payment_method TEXT NOT NULL,
      payment_status TEXT DEFAULT 'PAID',
      is_credit_sale INTEGER DEFAULT 0,
      is_interstate INTEGER DEFAULT 0,
      status TEXT DEFAULT 'COMPLETED',
      is_synced INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      synced_at TEXT,
      UNIQUE(store_id, local_id)
    )
  `);

  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS invoice_items (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      hsn_code TEXT,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      mrp REAL NOT NULL,
      discount REAL DEFAULT 0,
      gst_rate REAL NOT NULL,
      cgst_amount REAL DEFAULT 0,
      sgst_amount REAL DEFAULT 0,
      igst_amount REAL DEFAULT 0,
      total_amount REAL NOT NULL,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id)
    )
  `);

  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS stock_movements (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      batch_id TEXT, -- For batch-level tracking (FEFO)
      type TEXT NOT NULL, -- 'IN' | 'OUT' | 'ADJUSTMENT'
      quantity REAL NOT NULL,
      reference_type TEXT, -- 'INVOICE', 'PURCHASE', 'ADJUSTMENT', 'RETURN'
      reference_id TEXT,
      notes TEXT,
      created_at TEXT NOT NULL
    )
  `);

  // Migration: Add batch_id column if it doesn't exist (for existing databases)
  await db.executeSql(`
    ALTER TABLE stock_movements ADD COLUMN batch_id TEXT
  `).catch(() => {
    // Column already exists, ignore error
  });

  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS batches (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      batch_number TEXT NOT NULL,
      quantity REAL NOT NULL,
      remaining_qty REAL NOT NULL,
      mfg_date TEXT,
      expiry_date TEXT,
      purchase_price REAL NOT NULL,
      created_at TEXT NOT NULL,
      synced_at TEXT,
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS credit_ledger (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      type TEXT NOT NULL, -- 'DEBIT' | 'CREDIT'
      amount REAL NOT NULL,
      balance REAL NOT NULL,
      reference_type TEXT,
      reference_id TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      synced_at TEXT,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    )
  `);

await db.executeSql(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload TEXT NOT NULL,
      retry_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      processed_at TEXT,
      installation_id TEXT NOT NULL DEFAULT ''
    )
  `);

  // Migration: Add installation_id column if it doesn't exist
  await db.executeSql(`
    ALTER TABLE sync_queue ADD COLUMN installation_id TEXT NOT NULL DEFAULT ''
  `).catch(() => {
    // Column already exists, ignore error
  });

  // Create indices for performance
  await db.executeSql(`CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)`);
  await db.executeSql(`CREATE INDEX IF NOT EXISTS idx_products_store ON products(store_id)`);
  await db.executeSql(`CREATE INDEX IF NOT EXISTS idx_invoices_synced ON invoices(is_synced)`);
  await db.executeSql(`CREATE INDEX IF NOT EXISTS idx_sync_queue_entity ON sync_queue(entity_type)`);
  await db.executeSql(`CREATE INDEX IF NOT EXISTS idx_sync_queue_local_id ON sync_queue(entity_type, entity_id)`);
  await db.executeSql(`CREATE INDEX IF NOT EXISTS idx_batches_product ON batches(product_id)`);
  await db.executeSql(`CREATE INDEX IF NOT EXISTS idx_batches_expiry ON batches(expiry_date)`);
  await db.executeSql(`CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id)`);
  await db.executeSql(`CREATE INDEX IF NOT EXISTS idx_stock_movements_batch ON stock_movements(batch_id)`);
  await db.executeSql(`CREATE INDEX IF NOT EXISTS idx_credit_ledger_customer ON credit_ledger(customer_id)`);

  return db;
}

/**
 * Get database instance
 */
export function getDB(): SQLite.SQLiteDatabase {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Close database connection
 */
export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.close();
    db = null;
  }
}

/**
 * Execute a single SQL statement
 */
export async function executeSql(sql: string, params: any[] = []): Promise<SQLite.ResultSet> {
  const database = getDB();
  const [result] = await database.executeSql(sql, params);
  return result;
}

/**
 * Execute multiple SQL statements in a transaction
 */
export async function executeTransaction(
  queries: Array<{ sql: string; params: any[] }>
): Promise<void> {
  const database = getDB();
  await database.transaction((tx) => {
    for (const query of queries) {
      tx.executeSql(query.sql, query.params);
    }
  });
}
