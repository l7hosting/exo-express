# Deploying the dashboard to Surge

Target: **https://exoexpress.surge.sh/**

> **Current status:** the live Surge deployment is a static dashboard shell
> built without a public API URL. It renders a visible "API en direct non
> connectée" notice; login and live data do not work there. Rebuild with
> `NEXT_PUBLIC_API_URL` and redeploy to connect it.
>
> The production target for the main dashboard is now
> `https://www.exoexpress.ma/dashboard/`; see
> [`DEPLOY_CPANEL.md`](DEPLOY_CPANEL.md).

The dashboard is a Next.js App Router application compiled to static files
(`output: "export"`). It has no server runtime: every screen calls the Fastify
API in the browser using `NEXT_PUBLIC_API_URL`.

## Prerequisites

1. **Surge account and session.** Authenticate once on the deployment machine:

   ```powershell
   npx --yes surge@0.46.0 login
   npx --yes surge@0.46.0 whoami    # must print the account email
   ```

2. **A public HTTPS API URL.** `NEXT_PUBLIC_API_URL` is compiled into the
   client bundle. `http://localhost:3001` only works on the machine running the
   API and is not a production backend. The API must be reachable over HTTPS
   from the public internet.

3. **CORS allowlist on the API.** The deployed dashboard origin must be allowed
   server-side, otherwise the browser blocks every request:

   ```powershell
   $env:CORS_ORIGINS = "https://exoexpress.surge.sh"
   ```

   Set this in the API's production environment, not only in a shell.

## Build

```powershell
cd apps/web
$env:NEXT_PUBLIC_API_URL = "https://<public-api-host>"
npm run build
```

The build writes `apps/web/out/`. Verify it contains `index.html`,
`login/index.html`, `shipments/index.html`, `shipments/view/index.html`,
`200.html` and the `_next` asset directory.

## Root vs. sub-path builds

`NEXT_PUBLIC_BASE_PATH` selects the deployment prefix. It is empty by default,
so a root deployment (Surge, local preview) keeps working unchanged:

```powershell
Remove-Item Env:NEXT_PUBLIC_BASE_PATH -ErrorAction SilentlyContinue
npm run build
```

For cPanel/Hostinger at `https://www.exoexpress.ma/dashboard/`:

```powershell
$env:NEXT_PUBLIC_BASE_PATH = "/dashboard"
$env:NEXT_PUBLIC_API_URL = "https://api.exoexpress.ma"
npm run build
```

The value must start with `/` and must not end with `/`; anything else throws a
build-time error. `next/link` and `useRouter` apply the prefix automatically —
never add it by hand. Raw asset URLs (`BrandLogo`, `200.html`, `.htaccess`) use
`lib/base-path.ts` or runtime URL detection instead.

Copy the **contents** of `out/` into `public_html/dashboard/` (so
`public_html/dashboard/index.html` exists). The root public website is not
modified. `public/.htaccess` is exported to `out/.htaccess` and only applies
inside the dashboard directory; its `ErrorDocument 404 /dashboard/200.html`
assumes that exact sub-path.

## Deploy

```powershell
cd apps/web
npx --yes surge@0.46.0 ./out exoexpress.surge.sh
```

A `CNAME` file is not required; the domain is passed on the command line.

## Verify

```powershell
curl.exe -sS -o NUL -w "%{http_code}`n" https://exoexpress.surge.sh/
curl.exe -sS -o NUL -w "%{http_code}`n" https://exoexpress.surge.sh/login/
curl.exe -sS -o NUL -w "%{http_code}`n" https://exoexpress.surge.sh/shipments/
curl.exe -sS -o NUL -w "%{http_code}`n" "https://exoexpress.surge.sh/shipments/view/?id=00000000-0000-0000-0000-000000000000"
```

A successful deployment returns `200` for the pages above, serves the
`EXO EXPRESS` wordmark/login screen, and loads the JavaScript bundles from
`/_next/`.

## Static-export constraints

- The shipment detail route is `/shipments/view/?id=<shipment-id>` (previously
  `/shipments/[id]`). `public/200.html` redirects legacy `/shipments/<id>` (and
  `/dashboard/shipments/<id>`) links to the new route on hosts that support a
  SPA fallback, which Surge does and cPanel does through `.htaccess`.
- `next start` is not valid for a static export. Use `npm start` (serves `out/`
  with `serve`) or any static file server.
- API responses, authentication and all data remain server-side. The static
  site contains no customer data, no tokens and no secrets.
- The official logo PNGs are not present in the repository; the dashboard uses
  the typographic orange/navy wordmark fallback. Do not invent a logo.
