# Core POS + Inventory Feature Documentation

## Overview
This document describes the Core POS + Inventory feature implementation for RetailPOS, including billing, barcode scanning, inventory management, and India GST compliance.

## Architecture

### Backend (Node.js + Express + Prisma)
```
backend/
├── prisma/
│   └── schema.prisma       # Database schema
├── src/
│   ├── config/             # Environment configuration
│   ├── modules/
│   │   ├── auth/           # Authentication (JWT-based)
│   │   ├── billing/        # Invoice creation & management
│   │   ├── gst/            # India GST calculation engine
│   │   ├── products/       # Product & inventory CRUD
│   │   └── sync/           # Offline data synchronization
│   ├── shared/
│   │   ├── middleware/     # Express middleware (auth, error handling)
│   │   ├── database/       # Prisma client singleton
│   │   └── utils/          # Logger, error types
│   └── index.ts            # Server entry point
└── tests/
    └── unit/               # Unit tests (22 tests passing)
```

### Mobile (React Native)
```
mobile/
├── src/
│   ├── config/             # App configuration
│   ├── modules/
│   │   ├── auth/           # Auth state management
│   │   ├── billing/        # POS cart & checkout
│   │   ├── barcode/        # Barcode scanning
│   │   ├── sync/           # Offline sync engine
│   │   └── inventory/      # Inventory management
│   ├── shared/
│   │   ├── database/       # SQLite offline storage
│   │   ├── api/            # Axios API client
│   │   └── components/     # Reusable UI components
│   ├── screens/            # App screens
│   └── store/              # Zustand state stores
```

## Key Features

### 1. India GST Compliance
- **CGST+SGST** split for intrastate transactions (e.g., 18% → 9%+9%)
- **IGST** for interstate transactions
- **GSTIN validation** with regex (15-char format)
- **HSN code** support per product
- **Tax-exempt** and **NIL-rated** product support
- **Invoice-level discount** with proportional tax adjustment

### 2. Billing Engine
- Transaction-safe invoice creation (Serializable isolation)
- **Duplicate prevention** via `localId` for offline sync
- **Stock validation** before billing
- **FEFO batch selection** (First Expiry First Out)
- Support for Cash, Card, UPI, Credit, and Partial payment
- Running **customer credit ledger**

### 3. Barcode Scanning
- Camera-based barcode scanning (EAN-13, EAN-8, UPC-A, UPC-E, Code-128, Code-39)
- Manual barcode entry fallback
- Debounce protection against duplicate scans
- Instant product lookup from local SQLite database

### 4. Inventory Management
- Real-time stock tracking
- Low-stock alerts (configurable threshold)
- Batch/expiry tracking
- Stock movement audit trail
- Inventory adjustments with reason notes

### 5. Offline-First Architecture
- **SQLite** local database on device
- Automatic sync when connection restored
- Sync queue with retry mechanism
- Bidirectional sync (push local changes, pull server changes)
- Conflict detection and resolution

## API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/register | Register new store owner |
| POST | /api/auth/login | Login with email/password |
| POST | /api/auth/refresh | Refresh access token |
| POST | /api/auth/logout | Invalidate refresh token |
| GET | /api/auth/me | Get current user |

### Billing
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/billing/invoices | Create new invoice |
| GET | /api/billing/invoices | List invoices (paginated) |
| GET | /api/billing/invoices/:id | Get invoice details |

### Products
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/products | Create product |
| GET | /api/products | List products (search/filter) |
| GET | /api/products/barcode/:barcode | Find by barcode |
| GET | /api/products/low-stock | Low stock alerts |
| GET | /api/products/expiring | Expiring batches |
| POST | /api/products/:id/stock-adjustment | Adjust stock |

### Sync
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/sync/push | Push offline data |
| GET | /api/sync/pull | Pull server changes |
| GET | /api/sync/status | Sync status |

## Security
- JWT access + refresh tokens (7-day / 30-day expiry)
- Bcrypt password hashing (12 rounds)
- Rate limiting (100 req/15min default)
- Helmet.js security headers
- CORS configuration
- Input validation with Zod
- Serializable transactions for billing
- Audit logging for all data changes

## Testing
- 22 unit tests passing
- GST calculation tests (CGST/SGST/IGST splits, edge cases)
- Billing logic tests (totals, validation, stock checks)
- GSTIN validation tests

## Deployment
- Docker + Docker Compose for self-hosted
- PostgreSQL database
- GitHub Actions CI/CD pipeline
- Health check endpoint

## Next Steps
- [ ] Receipt printing (Bluetooth/Wi-Fi thermal printers)
- [ ] AI product recognition
- [ ] AI demand forecasting
- [ ] Voice billing
- [ ] Sales analytics dashboard
- [ ] Supplier management module
- [ ] Multi-store support
