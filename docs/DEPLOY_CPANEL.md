# Deploying the dashboard to cPanel (`/dashboard/`)

Target: **https://www.exoexpress.ma/dashboard/**

The public website at **https://www.exoexpress.ma/** is a separate site and must
not be replaced. The dashboard is a static Next.js export copied into its own
subdirectory, `public_html/dashboard/`.

> **Status at the time of writing (2026-10-22): NOT DEPLOYED.**
>
> - `https://www.exoexpress.ma/` → `200` (public site intact).
> - `https://www.exoexpress.ma/dashboard/` → `404` (dashboard not uploaded).
> - `https://api.exoexpress.ma/health` → `404` (API not reachable at the
>   expected path), even though the hostname resolves to `144.76.198.187`.
> - Login and live data therefore do **not** work in production yet.

This runbook does not modify DNS, the public website, or the database.

> The Fastify API is a separate deployment. Its cPanel feasibility, Node 20 /
> Passenger requirements, PostgreSQL checks, and database safety procedure are
> documented in [`DEPLOY_CPANEL_API.md`](./DEPLOY_CPANEL_API.md).

## 1. Prerequisites

1. **Back up before touching anything.**
   - cPanel → **File Manager** → select `public_html` → **Compress** → download
     the archive, or use SSH:
     ```bash
     tar -czf ~/public_html-backup-$(date +%F).tar.gz ~/public_html
     ```
   - If `public_html/dashboard/` already exists, back it up separately.
2. **Working API over HTTPS.** The dashboard is static; every screen calls the
   API from the browser. `https://api.exoexpress.ma/health` and
   `/health/ready` must return `200` JSON before login can work.
3. **CORS allowlist.** The API must allow the dashboard origin:
   `CORS_ORIGINS=https://www.exoexpress.ma`.
4. **A staff account** for the post-deploy login test. Do not use production
   data to test destructive actions.

## 2. Build the `/dashboard/` artifact

From the repository root, in PowerShell:

```powershell
cd apps/web
$env:NEXT_PUBLIC_API_URL = "https://api.exoexpress.ma"
$env:NEXT_PUBLIC_BASE_PATH = "/dashboard"
npm run build
```

The base path must start with `/` and must not end with `/`; the build fails
fast otherwise. `next/link` and `useRouter` apply the prefix automatically.
Raw URLs use `lib/base-path.ts`.

Required files in `apps/web/out/`:

```text
index.html                 (serves /dashboard/)
login/index.html
shipments/index.html
shipments/new/index.html
shipments/view/index.html
couriers/index.html
cod/index.html
settlements/index.html
merchants/index.html
zones/index.html
200.html                   (branded 404 + legacy shipment redirect)
.htaccess                  (dashboard-directory only)
_next/                     (hashed JS/CSS assets)
```

Sanity checks before uploading:

```powershell
Select-String -Path out/index.html -Pattern '/dashboard/_next/'
Select-String -Path out/index.html -Pattern 'api.exoexpress.ma'
```

> `npm start` (the `serve out` script) is for a **root** build. Do not use it
> to preview this artifact: it would serve `out/` at `/`, while the bundle asks
> for `/dashboard/_next/...`. Preview by copying `out/` into a local
> `public_html/dashboard/` directory and serving `public_html/` at the root.

The API URL is compiled into the browser bundle. Never put a secret in a
`NEXT_PUBLIC_*` variable.

## 3. Upload safely

1. In cPanel → **File Manager**, open `public_html`.
2. Create `public_html/dashboard/` if it does not exist.
3. Upload the **contents** of `apps/web/out/` into `public_html/dashboard/`.
   The result must be `public_html/dashboard/index.html`, not
   `public_html/dashboard/out/index.html`.
4. Upload hidden files (`.htaccess`). In File Manager, enable
   **Settings → Show Hidden Files (dotfiles)**; otherwise use FTP/SFTP.
5. **Never** upload the export into `public_html/` directly and never delete or
   overwrite the public website's `index.php`, `index.html`, WordPress files,
   `.htaccess`, or `wp-content/`.
6. Permissions: directories `755`, files `644` (`.htaccess` `644`).

The bundled `public/.htaccess` applies only inside `public_html/dashboard/`:

- `DirectoryIndex index.html`
- `Options -MultiViews`
- `ErrorDocument 404 /dashboard/200.html`
- long-lived caching for `/_next/static/`, `no-cache` for HTML

If the host rejects one of the optional modules (`mod_headers`,
`mod_expires`), the `<IfModule>` guards keep the rest working. If Apache
returns a 500, remove `Options -MultiViews` first (some hosts forbid
`AllowOverride Options`); if it still fails, keep only `DirectoryIndex` and
`ErrorDocument`.

## 4. API environment (production)

Set these in the API host's environment, not in the static site:

| Variable | Production value / note |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | PostgreSQL connection string (secret) |
| `CORS_ORIGINS` | `https://www.exoexpress.ma` (exact origin, no trailing slash; comma-separated if more origins) |
| `TRUST_PROXY` | `true` only behind a reverse proxy that overwrites `X-Forwarded-For` |
| `SESSION_TTL_DAYS` | `7` (default) |
| `MAX_ACTIVE_SHIPMENTS_PER_COURIER` | `30` (default) |
| `LOG_LEVEL` | `info` |
| `RATE_LIMIT_ENABLED` | `true` in production |
| `PORT` / `API_PORT` | Port the Fastify process listens on |

`NODE_ENV=production` refuses to start with an empty, wildcard, non-HTTPS, or
non-exact `CORS_ORIGINS` entry, by design. See
[`DEPLOY_CPANEL_API.md`](./DEPLOY_CPANEL_API.md) for the full API environment.

Verify CORS preflight before blaming the dashboard:

```bash
curl -i -X OPTIONS https://api.exoexpress.ma/api/v1/auth/login \
  -H "Origin: https://www.exoexpress.ma" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type"
```

Expect `access-control-allow-origin: https://www.exoexpress.ma` and a `2xx`
status. Then test a real login. Do not claim login works until that succeeds.

## 5. Verify the deployment

```powershell
$urls = @(
  "https://www.exoexpress.ma/dashboard/",
  "https://www.exoexpress.ma/dashboard/login/",
  "https://www.exoexpress.ma/dashboard/shipments/",
  "https://www.exoexpress.ma/dashboard/shipments/new/",
  "https://www.exoexpress.ma/dashboard/couriers/",
  "https://www.exoexpress.ma/dashboard/cod/",
  "https://www.exoexpress.ma/dashboard/settlements/",
  "https://www.exoexpress.ma/dashboard/merchants/",
  "https://www.exoexpress.ma/dashboard/zones/",
  "https://www.exoexpress.ma/dashboard/200.html"
)
foreach ($u in $urls) {
  $code = curl.exe -sS -o NUL -w "%{http_code}" $u
  "$code  $u"
}
```

Expect `200` for all of the above. Additionally:

- `/dashboard/definitely-not-a-page/` → `404` with the branded
  **Page introuvable** page (served by `200.html`).
- `/dashboard/shipments/<uuid>/` → browser redirects to
  `/dashboard/shipments/view/?id=<uuid>`.
- A JS asset from `/dashboard/_next/static/...` → `200`.
- Browser DevTools console: no 404s for assets; API requests point at
  `https://api.exoexpress.ma`, not `localhost`.

Confirm the public site is untouched:

```powershell
curl.exe -sS -o NUL -w "%{http_code}`n" https://www.exoexpress.ma/
```

## 6. Rollback

If the dashboard is broken:

1. Delete or rename `public_html/dashboard/`.
2. Restore the previous `dashboard/` folder from its backup.
3. If anything at the `public_html` root was changed by mistake, restore the
   full `public_html` archive from step 1. The root site backup is the source
   of truth.

No database migration is required for this deployment. Do not run
`prisma migrate reset`, `db push`, or `prisma:seed` against production.

## 7. What is still missing (blockers, not deployment bugs)

1. **API not live at the expected URL.** `https://api.exoexpress.ma/health`
   currently returns `404`. The Fastify API must be deployed and
   reverse-proxied at that hostname before authentication or live data can work.
   See [`DEPLOY_CPANEL_API.md`](./DEPLOY_CPANEL_API.md) for the API-specific
   blockers (Node 20, Passenger, PostgreSQL, Prisma generation, SSL/DNS).
2. **CORS not yet confirmed.** The API must be configured with
   `CORS_ORIGINS=https://www.exoexpress.ma` and restarted.
3. **Dashboard not uploaded.** `https://www.exoexpress.ma/dashboard/` is still
   `404`.
4. **Official logo assets are absent** from the repository. The dashboard uses
   the existing typographic orange/navy fallback. Do not invent a logo.
