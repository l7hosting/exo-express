/**
 * Helpers for raw URLs that Next.js does not rewrite itself.
 *
 * `next/link`, `next/navigation` (`useRouter`) and `next/image` already apply
 * `basePath` automatically — never prefix those destinations by hand or the
 * path is applied twice. Only raw values (plain `<img src>`, `fetch`, `<a href>`,
 * `window.location`) need `withBasePath`.
 *
 * The value is inlined at build time from NEXT_PUBLIC_BASE_PATH and normalised
 * by next.config.ts. It is `""` for root deployments.
 */
const configured = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").trim();

export const BASE_PATH = configured.endsWith("/")
  ? configured.replace(/\/+$/, "")
  : configured;

const ABSOLUTE_URL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/**
 * Prefix an application-relative path with the configured base path.
 *
 * - Absolute URLs (`https://…`, `//cdn…`) and data/blob URLs are returned as-is.
 * - An empty path resolves to the deployment root.
 * - Paths that already carry the base path are not prefixed twice.
 */
export function withBasePath(path: string): string {
  if (!path) return BASE_PATH || "/";
  if (ABSOLUTE_URL.test(path)) return path;

  const normalized = path.startsWith("/") ? path : `/${path}`;

  if (!BASE_PATH) return normalized;
  if (normalized === BASE_PATH || normalized.startsWith(`${BASE_PATH}/`)) return normalized;

  return `${BASE_PATH}${normalized}`;
}
