import type { NextConfig } from "next";

/**
 * Normalise NEXT_PUBLIC_BASE_PATH.
 *
 * - Empty (default) keeps the root deployment working (Surge, local preview).
 * - A sub-path build (e.g. `/dashboard`) must be absolute and without a
 *   trailing slash, otherwise Next emits broken asset URLs.
 */
function resolveBasePath(raw: string | undefined): string {
  const value = (raw ?? "").trim();

  if (!value) return "";

  if (!value.startsWith("/")) {
    throw new Error(
      `Invalid NEXT_PUBLIC_BASE_PATH "${value}": it must start with "/" (for example "/dashboard"). ` +
        `Leave it empty for a root deployment.`
    );
  }

  if (value.endsWith("/")) {
    throw new Error(
      `Invalid NEXT_PUBLIC_BASE_PATH "${value}": it must not end with "/" (use "/dashboard", not "/dashboard/").`
    );
  }

  if (value.includes("//")) {
    throw new Error(
      `Invalid NEXT_PUBLIC_BASE_PATH "${value}": it must not contain "//".`
    );
  }

  return value;
}

const basePath = resolveBasePath(process.env.NEXT_PUBLIC_BASE_PATH);

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  reactStrictMode: true,
  transpilePackages: ["@exo/shared"],
  images: { unoptimized: true, formats: ["image/avif", "image/webp"] },
  // Expose the normalised value to the browser bundle so lib/base-path.ts and
  // next.config.ts can never disagree about the configured prefix.
  env: { NEXT_PUBLIC_BASE_PATH: basePath }
};

export default nextConfig;
