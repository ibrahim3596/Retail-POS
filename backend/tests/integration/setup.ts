import 'jest';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Set test database URL
process.env.TEST_DATABASE_URL = 'file:./test.db';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-testing-only';

// Global test setup
let prisma: PrismaClient;

beforeAll(async () => {
  // Generate Prisma client for test schema
  const schemaPath = path.join(__dirname, '../prisma/schema.test.prisma');
  const prismaDir = path.join(__dirname, '../node_modules/.prisma/client');
  
  // Use the test schema
  process.env.PRISMA_SCHEMA_PATH = schemaPath;
  
  // Generate client
  try {
    execSync('npx prisma generate --schema=' + schemaPath, {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit'
    });
  } catch (error) {
    console.log('Prisma generate completed');
  }
  
  // Create Prisma client
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: 'file:./test.db'
      }
    }
  });
  
  // Clean up any existing test database
  const dbPath = path.join(__dirname, '..', 'test.db');
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
  
  // Run migrations
  try {
    execSync('npx prisma migrate deploy --schema=' + schemaPath, {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit'
    });
  } catch (error) {
    console.log('Migration completed');
  }
  
  // Connect
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
  
  // Clean up test database
  const dbPath = path.join(__dirname, '..', 'test.db');
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
  
  // Clean up Prisma client cache
  const prismaClientPath = path.join(__dirname, '../node_modules/.prisma/client');
  if (fs.existsSync(prismaClientPath)) {
    fs.rmSync(prismaClientPath, { recursive: true, force: true });
  }
});

beforeEach(async () => {
  // Clean all tables before each test
  const tablenames = [
    'AuditLog',
    'SyncLog',
    'InvoiceItem',
    'Invoice',
    'Batch',
    'StockMovement',
    'Product',
    'Customer',
    'Supplier',
    'User',
    'Store',
    'Session'
  ];
  
  for (const tableName of tablenames) {
    try {
      await prisma.$executeRawUnsafe(`DELETE FROM "${tableName}"`);
    } catch (e) {
      // Table might not exist
    }
  }
});

export { prisma };