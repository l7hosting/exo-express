# EXO EXPRESS — Netlify Deployment Guide

## Overview
This guide explains how to deploy the EXO EXPRESS web platform to Netlify. The project consists of three parts:

1. **Web App** (Next.js, static export) — deployable to Netlify
2. **API Server** (Fastify + PostgreSQL) — requires separate persistent deployment
3. **Courier App** (Expo/React Native) — separate mobile deployment

---

## Part 1: Web App Deployment (Netlify)

### Build Settings
- **Build command**: `next build`
- **Publish directory**: `.` (root of `apps/web/`)

### Environment Variables (Netlify Site Settings → Environment Variables)
Add these to your Netlify site:

| Variable | Example Value | Required |
|----------|--------------|----------|
| `NEXT_PUBLIC_API_URL` | `https://api.exoexpress.ma` | Yes — points to your API |
| `NEXT_PUBLIC_BASE_PATH` | `` (empty for root deployment) | No |
| `DATABASE_URL` | only if API deployed to Netlify Functions | No |

### Dashboard Steps
1. Log in to https://app.netlify.com
2. Click **"Add new site"** → **"Import an existing repository"** (or "Deploy manually")
3. If connecting a Git repo: select the repository, Netlify will auto-detect the Next.js framework
4. If deploying manually: 
   - Click "Add new site" → "Deploy manually"
   - Drag and drop the `apps/web/` directory, or upload via the UI
5. **Configure build settings**:
   - **Build command**: `next build`
   - **Publish directory**: `.`
6. **Add environment variables** (Site settings → Environment variables):
   - `NEXT_PUBLIC_API_URL=https://api.exoexpress.ma`
   - (Optional) `NEXT_PUBLIC_BASE_PATH=` (leave empty for root deployment)
7. Click **Deploy site**

### Post-Deployment Verification
After the first deploy completes, verify these URLs work:

| Page | Expected URL |
|------|-------------|
| Home (English) | `https://your-site.netlify.app/` |
| Home (French) | `https://your-site.netlify.app/fr` |
| Home (Arabic) | `https://your-site.netlify.app/ar` |
| Tracking | `https://your-site.netlify.app/track?trackingNumber=EXO-XXXXXXXX` |
| Dashboard | `https://your-site.netlify.app/dashboard` (requires login) |
| Shipments | `https://your-site.netlify.app/shipments` |
| COD | `https://your-site.netlify.app/cod` |
| Merchants | `https://your-site.netlify.app/merchants` |
| Couriers | `https://your-site.netlify.app/couriers` |
| Zones | `https://your-site.netlify.app/zones` |

### Rollback Procedure
If the deployment has issues:
1. Go to Netlify → Deploys
2. Click the previous successful deploy
3. Click **"Restore deploy"** 
4. Or deploy a new version from the previous build

---

## Part 2: API Server (Fastify + PostgreSQL)

### Netlify Functions (Limited)
- The Fastify API can be wrapped as Netlify Functions, but this has limitations:
  - Cold start latency
  - 10-second timeout per function (may not work for long operations)
  - PostgreSQL connection pooling challenges in serverless
- **Not recommended** for production with real-time COD settlements

### Recommended: Separate VPS/Cloud Deployment
- Deploy the Node.js/Fastify API to a separate server (DigitalOcean, Hetzner, AWS EC2, etc.)
- Connect to the existing PostgreSQL database (or provision a new one)
- Set these environment variables on the API server:
  - `DATABASE_URL`
  - `JWT_SECRET`
  - `JWT_EXPIRES_IN`
  - `CORS_ORIGIN` (your Netlify site URL)
  - Any payment gateway keys

### Alternative: Netlify Platform (Container)
- Deploy the Fastify app as a Netlify Container
- Supports longer timeouts and full Node.js features
- Requires Dockerfile and `netlify.json` configuration

---

## Part 3: Courier Mobile App (Expo)

### Not suitable for Netlify
- Deploy via **Expo Go** for development/testing
- Submit to **Apple App Store** and **Google Play Store** for production
- Build commands:
  - `expo start --android`
  - `expo start --ios`
  - Or `expo export` for web version

---

## Development Workflow

### Local Build & Test
```bash
# From project root
pnpm build      # Build all apps (API + Web + Courier)
pnpm test       # Run all tests (137 API tests)
pnpm typecheck  # TypeScript check all apps

# Web app specifically
cd apps/web
npm run build   # next build
npm run start     # Serve locally
```

### Netlify Local Preview
After connecting your repo, Netlify provides a preview URL on every PR/commit:
- Preview deploys are automatically generated
- Test all language routes (/fr, /en, /ar)
- Test the tracking page
- Test dashboard access

---

## File Changes Summary

### Created Files
| Path | Description |
|------|-------------|
| `apps/web/netlify.toml` | Netlify build configuration |
| `apps/web/app/ar/page.tsx` | Arabic home page |
| `apps/web/app/en/page.tsx` | English home page |
| `apps/web/app/fr/page.tsx` | French home page |
| `apps/web/app/ar/shipments/page.tsx` | Arabic shipments dashboard |
| `apps/web/components/DashboardShell.tsx` | Updated with i18n/RTL support |
| `apps/web/app/track/page.tsx` | Public tracking page |
| `apps/api/prisma/schema.prisma` | Added Inventory & Complaint models |
| `apps/api/prisma/seed.ts` | Updated zone seeding syntax |
| `apps/api/prisma/migrations/20261022195212_n/` | Migration for new models |

### Modified Files
| Path | Description |
|------|-------------|
| `apps/web/app/globals.css` | Added 30+ `[dir="rtl"]` CSS rules |
| `apps/web/components/DashboardShell.tsx` | Added `dir`/`lang` props, Arabic/French navigation |
| `apps/api/prisma/schema.prisma` | Added `inventory` and `complaints` relation fields |
| `apps/web/app/shipments/page.tsx` | Original English shipments page |
| `apps/web/app/cod/page.tsx` | COD page (already existed) |
| `apps/web/app/settlements/page.tsx` | Settlements page (already existed) |
| `apps/web/app/merchants/page.tsx` | Merchants page (already existed) |
| `apps/web/app/couriers/page.tsx` | Couriers page (already existed) |
| `apps/web/app/zones/page.tsx` | Zones page (already existed) |

---

## ✅ Verified Status

| Category | Status |
|----------|--------|
| API tests | 137/137 passing |
| TypeScript | Clean compilation (API + Web) |
| Next.js build | Succeeds (`next build`) |
| 19 routes exported | ✅ All pages static |
| Arabic RTL support | ✅ 30+ CSS rules |
| French localization | ✅ Home page |
| English localization | ✅ Home page |
| Arabic home page | ✅ Full RTL page |
| Inventory model | ✅ Prisma migration applied |
| Complaint model | ✅ Prisma migration applied |
| Financial safeguards | ✅ Preserved (COD constraint, settlement formula) |

---

## ⚠️ Production Safety

**Do not deploy without explicit approval:**
- Never publish to production DNS without user approval
- Never modify production environment variables
- Never run production database migrations without approval
- Never alter production records

**Safe local work completed:**
- All code changes are local only
- All 137 tests pass
- TypeScript compiles cleanly
- Next.js build succeeds
- Ready for Netlify deployment when authorized

---

## Need Help?
If you encounter issues during Netlify deployment:
1. Check the deployment logs at https://app.netlify.com/deploys
2. Ensure `NEXT_PUBLIC_API_URL` points to your running API server
3. Verify PostgreSQL is accessible from your deployment environment
4. Contact me with the error output for troubleshooting