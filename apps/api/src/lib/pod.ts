import { badRequest } from "./errors.js";

/**
 * Characters that are never valid in a proof-of-delivery reference. Control
 * characters allow log/CSV injection; angle brackets and quotes allow markup
 * or attribute breaking when the reference is rendered by a dashboard.
 */
const FORBIDDEN_CHARACTERS = /[\u0000-\u001F\u007F<>"']/;

/**
 * URL schemes that execute code or expose local files when a reference is used
 * as a link/image source. Compared after trimming leading whitespace so
 * `"  JavaScript:alert(1)"` cannot slip through.
 */
const FORBIDDEN_SCHEMES = ["javascript:", "data:", "vbscript:", "file:"];

/**
 * Validates an opaque POD reference (photo path, signature blob id, URL...).
 *
 * Allowed examples: `uploads/pod/phase2.jpg`, `sig-1`, `https://cdn/x.jpg`,
 * `/relative/path`. Rejected: control characters, `< > " '`, and the
 * `javascript:`, `data:`, `vbscript:` and `file:` schemes (case-insensitive).
 */
export function assertSafePodReference(value: string | null | undefined, field = "reference"): void {
  if (value === null || value === undefined) return;

  if (FORBIDDEN_CHARACTERS.test(value)) {
    throw badRequest(`${field} contains forbidden characters`);
  }

  const normalised = value.replace(/^\s+/, "").toLowerCase();
  const scheme = FORBIDDEN_SCHEMES.find((candidate) => normalised.startsWith(candidate));
  if (scheme) {
    throw badRequest(`${field} uses the forbidden "${scheme}" scheme`);
  }
}
