# EXO EXPRESS — Delivery Management Platform

![EXO EXPRESS](https://www.exoexpress.ma/)

A complete delivery management platform comparable to SKSystem, built with EXO EXPRESS branding and functionality. This platform includes public website, shipment tracking, admin dashboard, merchant portal, courier workflows, COD and settlements, inventory management, team management, notifications, support, statistics/reports, and French/Arabic/English localization with RTL support.

## 📋 Table of Contents

- [Project Architecture](#project-architecture)
- [Local Development](#local-development)
- [Required Environment Variables](#required-environment-variables)
- [Testing](#testing)
- [Netlify Deployment](#netlify-deployment)
- [Project Structure](#project-structure)
- [Available Scripts](#available-scripts)

## 🏗️ Project Architecture

### Monorepo Structure (pnpm Workspace)

```
exo-express/
├─ apps/api/          # Fastify + PostgreSQL API server
├─ apps/web/          # Next.js 15 (static export — output: "export")
├─ apps/courier/      # Expo / React Native mobile app
├─ packages/shared/   # Shared types, themes, ROLES, enums
└─ prisma/            # Database schema & migrations
```

### API Layer (`apps/api/`)

- **Framework**: Fastify v5 + PostgreSQL
- **ORM**: Prisma v6
- **Authentication**: JWT-based, client-local storage
- **Key Features**:
  - Shipment management (CRUD + status transitions)
  - COD collection with unique shipment constraint (concurrent-safe)
  - Merchant settlements with formula: `netPayable = grossCod - deliveryFees - returnFees + adjustments`
  - Zone & tariff configuration
  - Courier assignments & POD (photo/signature/OTP)
  - 9 user roles: SUPER_ADMIN, ADMIN, OPERATIONS, DISPATCHER, DEPOT_AGENT, COURIER, MERCHANT, ACCOUNTANT, SUPPORT
  - 137 passing API tests with real PostgreSQL assertions
  - Financial safeguards (segregation of duties, unique constraints)

### Web Application (`apps/web/`)

- **Framework**: Next.js 15 with App Router, `output: "export"` (static HTML)
- **i18n**: French (FR), English (EN), Arabic (AR) with full RTL support
- **Key Features**:
  - Public home pages for FR/EN/AR
  - Public shipment tracking (`/track?trackingNumber=EXO-XXXXXXXX`) — no auth required
  - Admin dashboard with all core pages (shipments, COD, settlements, merchants, couriers, zones)
  - 30+ `[dir="rtl"]` CSS rules for Arabic layout support
  - DashboardShell with locale-aware rendering (`dir`/`lang` props)
  - All 19 routes statically exportable
  - Responsive design (mobile, tablet, desktop media queries)

### Courier Mobile App (`apps/courier/`)

- **Framework**: Expo SDK 52 + React Native
- **Routing**: expo-router
- **Features**: Login, missions list, mission detail with status transitions, POD (photo/signature/OTP), COD collection

### Shared Types (`packages/shared/`)

- `brandTheme` — EXO EXPRESS provisional palette (orange `#F36A0A`, navy `#071A42`)
- `ROLES` — 9 user roles
- `SHIPMENT_STATUSES`, `COD_STATUSES`, `SETTLEMENT_STATUSES`
- `ShipmentListItem`, `MerchantListItem`, `ZoneListItem`, `DashboardKpis`
- `SETTLEMENT_FORMULA` — single source of truth: `netPayable = grossCod - deliveryFees - returnFees + adjustments`

### Database (`prisma/`)

- **Schema**: Prisma v6 with PostgreSQL
- **Migrations**: Versioned, applied via `prisma migrate`
- **Seed**: Default 8 Casablanca zones + admin user (requires `SEED_ADMIN_PASSWORD`)
- **Models**: User, Session, AuditLog, Merchant, MerchantUser, Zone, ZoneTariff, Shipment, ShipmentAssignment, CodCollection, ProofOfDelivery, SettlementItem, Inventory, Complaint, ShipmentEvent, etc.

## 🚀 Local Development

### Prerequisites

- **Node.js**: >=20 (engines field in package.json)
- **pnpm**: v9.15.0 (packageManager field)
- **PostgreSQL**: Running instance with `exo_express` database
- **Git**: For version control

### Installation

```bash
# From project root
pnpm install

# Start all apps concurrently
pnpm dev

# Or start individually:
# API server
pnpm --filter @exo/api dev

# Web app
pnpm --filter @exo/web dev

# Courier app
pnpm --filter @exo/courier dev
```

### Development Commands

| Command | Description |
|---|---|
| `pnpm build` | Build all apps (API + Web + Courier) |
| `pnpm test` | Run all tests (137 API tests) |
| `pnpm typecheck` | TypeScript check all apps |
| `pnpm db:generate` | Generate Prisma client |
| `pnpm db:migrate` | Run Prisma migrations |
| `pnpm db:seed` | Seed database with default data |

### API Server Local

```bash
cd apps/api
pnpm dev        # tsx watch src/server.ts
pnpm build      # tsc -p tsconfig.json
pnpm start      # node dist/server.js
```

### Web App Local

```bash
cd apps/web
pnpm dev        # next dev -p 3000
pnpm build      # next build (output: "export")
pnpm start      # npx serve@14 out -l 3000
```

### Courier App Local

```bash
cd apps/courier
pnpm start      # expo start
# Then: expo start --android or expo start --ios
```

## 🔐 Required Environment Variables

### API Server (`apps/api/.env`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string `postgresql://...` |
| `JWT_SECRET` | Yes | Secret for JWT signing |
| `JWT_EXPIRES_IN` | Yes | Token expiration (e.g., `"1d"`, `"8h"`) |
| `CORS_ORIGIN` | Yes | Allowed origin for cross-origin requests (e.g., `http://localhost:3000`) |
| `STRIPE_KEY` | Optional | Stripe public key (if payment integration) |
| Any payment gateway keys | Optional | As needed |

### Web App (`apps/web/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | Yes | `http://localhost:3001` (dev) | Base URL of the API server |
| `NEXT_PUBLIC_BASE_PATH` | No | `""` | Root for sub-path deployment (e.g., `"/dashboard"`) |
| `NEXT_PUBLIC_BASE_URL` | No | `http://localhost:3001` | General base URL |

### ⚠️ Security Notes

- **Never commit `.env` files** — they are covered by `.gitignore`
- **`.env.example`** is safe to commit — it only contains placeholder values
- Use `dotenv` for local development
- All environment variables are read via `process.env` at runtime
- The web app gracefully handles missing `NEXT_PUBLIC_API_URL` with user-friendly error messages

## 🧪 Testing

### API Tests (137 passing)

```bash
pnpm test    # Runs all vitest test files
```

Test suites:
- `phase2.test.ts` — Courier operations and finance (42 tests)
- `security.test.ts` — Security and integrity regressions (19 tests)
- `integration.test.ts` — API integration with real PostgreSQL (20 tests)
- `settlements.test.ts` — Settlement formula & transitions (14 tests)
- `cod.test.ts` — COD collection logic (9 tests)
- `assignments.test.ts` — Shipment assignments (7 tests)
- `shipments.test.ts` — Shipment CRUD (7 tests)
- `config.test.ts` — Configuration logic (3 tests)
- `permissions.test.ts` — Role-based permissions (5 tests)
- `money.test.ts` — Money/Decimal operations (6 tests)
- `password.test.ts` — Password hashing (5 tests)

All tests use **real PostgreSQL** with full assertion of financial invariants.

### Web Tests

```bash
cd apps/web
pnpm test    # vitest run (currently typecheck-focused)
```

### Build Verification

```bash
# API
cd apps/api
pnpm typecheck    # tsc --noEmit

# Web
cd apps/web
pnpm typecheck    # tsc --noEmit
pnpm build        # next build (must succeed with output: "export")
```

## 📦 Netlify Deployment

### Web App Deployment

This project uses **Next.js with `output: "export"`**, making it compatible with Netlify's static deployment.

**Netlify Dashboard Settings**:

| Setting | Value |
|---|---|
| **Build command** | `next build` |
| **Publish directory** | `.` |
| **Environment variables** | `NEXT_PUBLIC_API_URL=https://api.exoexpress.ma`, `NEXT_PUBLIC_BASE_PATH=` (empty for root) |

**Deployment Steps**:

1. Log in to https://app.netlify.com
2. Click **"Add new site"** → connect GitHub repository or upload `apps/web/` directory manually
3. Configure build settings as above
4. Add `NEXT_PUBLIC_API_URL` env var pointing to your running API server
5. Click **Deploy site**
6. Verify all routes: `/`, `/fr`, `/en`, `/ar`, `/track?trackingNumber=EXO-XXXXXXXX`, `/dashboard`

**Important**: The API server (`apps/api/`) must be running separately — Netlify static export cannot host a Node.js server with PostgreSQL connections.

### API Server Deployment

The Fastify API requires a **separate persistent deployment** (VPS, Docker, or Netlify Functions with limitations). It cannot be hosted by the static web export.

## 📁 Project Structure

```
exo-express/
├─ .gitignore              # Protects secrets, .next, node_modules, .env files
├─ README.md              # This file
├─ packages/
│  └─ shared/             # Shared types, themes, ROLES, enums
│     └─ src/index.ts
├─ prisma/
│  ├─ schema.prisma       # Full database schema (User, Shipment, Inventory, Complaint, etc.)
│  └─ migrations/         # Prisma migration version history
│     └─ ... migration files
├─ apps/
│  ├─ api/                # Fastify + PostgreSQL server
│  │  ├─ src/             # Route handlers (auth, shipments, COD, merchants, zones, assignments, settlements, dashboard)
│  │  ├─ prisma/          # Prisma client & operations
│  │  ├─ lib/             # API client, base-path, money, cod, codTransactions, codSettlements, permissions, money
│  │  ├─ lib/             # settlements, cod, config, assignments, shipments, config, passwords, money
│  │  ├─ routes/          # API route handlers
│  │  ├─ lib/             # (various utility modules)
│  │  ├─ tests/           # 137 passing API tests
│  │  ├─ tsconfig.json
│  │  ├─ package.json
│  │  └─ prisma/
│  │     ├─ schema.prisma
│  │     └─ migrations/
│  └─ web/                # Next.js 15 App Router, static export
│     ├─ app/             # App Router pages (FR/EN/AR home, dashboard, tracking, etc.)
│     ├─ components/      # DashboardShell, BrandLogo, ApiNotice
│     ├─ globals.css      # Design tokens + 30+ [dir="rtl"] rules
│     ├─ package.json
│     ├─ next.config.ts   # output: "export", basePath handling
│     └─ netlify.toml     # Netlify build config
├─ apps/                  # Root-level alias
└─ courier/               # Expo SDK 52 + React Native mobile app
   ├─ package.json
   ├─ tsconfig.json
   ├─ src/               # Login, missions, mission detail, POD, COD collection
   └─ tsconfig.base.json
```

## 🛡️ Security & sensitive data

### What is NEVER committed

- `.env` files — covered by `.gitignore`
- API keys, payment credentials, database passwords
- Personal access tokens, OAuth secrets
- Production configuration overrides
- Any `*.key`, `*.pem`, `*.p12`, `*.p8` files

### What IS safe to commit

- `.env.example` — placeholder values only
- `prisma/schema.prisma` — database structure (no data)
- All source code `.ts`, `.jsx`, `.css` files
- Test files (no secrets)
- Configuration files (`next.config.ts`, `netlify.toml`, `tsconfig.json`)
- `.gitignore` — already protects `.env*` files

The existing `.gitignore` already protects:
- `.env`, `.env.local`, `.env.*.local` (only `!.env.example` is allowed)
- `node_modules/`, `.next/`, `dist/`, `out/`, `build/`, `coverage/`
- `*.jks`, `*.p8`, `*.p12`, `*.key`, `*.mobileprovision`
- And more...

## 📦 Available Scripts

### Root (`package.json`)

| Script | Description |
|---|---|
| `pnpm build` | Build all apps (API + Web + Courier) |
| `pnpm test` | Run all tests (137 API tests) |
| `pnpm typecheck` | TypeScript check all apps |
| `db:generate` | Generate Prisma client |
| `db:migrate` | Run Prisma migrations |
| `db:seed` | Seed database with default data |

### API (`apps/api/package.json`)

| Script | Description |
|---|---|
| `dev` | `tsx watch src/server.ts` |
| `build` | `tsc -p tsconfig.json` |
| `start` | `node dist/server.js` |
| `test` | `vitest run` |
| `prisma:generate` | `prisma generate` |
| `prisma:migrate` | `prisma migrate dev` |
| `prisma:migrate:deploy` | `prisma migrate deploy` |
| `prisma:seed` | `tsx prisma/seed.ts` |

### Web (`apps/web/package.json`)

| Script | Description |
|---|---|
| `dev` | `next dev -p 3000` |
| `build` | `next build` |
| `start` | `npx serve@14 out -l 3000` |
| `typecheck` | `tsc --noEmit` |
| `test` | `vitest run` |

### Courier (`apps/courier/package.json`)

| Script | Description |
|---|---|
| `start` | `expo start` |
| `android` | `expo start --android` |
| `ios` | `expo start --ios` |
| `typecheck` | `tsc --noEmit` |

## 📞 Need Help?

- **GitHub connection**: See "Connecting to GitHub" section below
- **Netlify deployment**: See Netlify Deployment section
- **Database issues**: Ensure PostgreSQL is running and `DATABASE_URL` is correct
- **i18n questions**: FR/EN/AR home pages with RTL support are in `apps/web/app/{ar,en,fr}/`

---

**EXO EXPRESS** — Complete delivery management platform with professional public website, multilingual support (FR/AR/EN with RTL), full admin dashboard, COD wallet/balances/settlements, inventory management, complaint system, and real API/database integration.

Licensed under EXO EXPRESS branding. All rights reserved.