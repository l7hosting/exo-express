Place the official EXO EXPRESS logo assets here:

- `logo-primary.png` — full horizontal logo, used in the dashboard sidebar, login card and footer.
- `logo-icon.png` — square mark, used for favicons, app icons and compact placements.

The files are referenced by:

- `apps/web/components/DashboardShell.tsx` (sidebar)
- `apps/web/app/login/page.tsx` (login card)

through the `BrandLogo` component (`apps/web/components/BrandLogo.tsx`).

While the official files are missing, `BrandLogo` falls back to a typographic wordmark built from
the provisional palette (orange `#F36A0A`, navy `#071A42`); it never draws a fake logo. Drop the
official PNGs in this folder and the fallback disappears automatically — no code change needed.
