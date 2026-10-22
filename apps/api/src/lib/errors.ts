export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new ApiError(400, "VALIDATION_ERROR", message, details);
export const unauthorized = (message = "Authentication required") =>
  new ApiError(401, "UNAUTHORIZED", message);
export const forbidden = (message = "Insufficient permissions") =>
  new ApiError(403, "FORBIDDEN", message);
export const notFound = (message = "Resource not found") =>
  new ApiError(404, "NOT_FOUND", message);
export const conflict = (message: string) => new ApiError(409, "CONFLICT", message);

/**
 * Maps a Prisma unique-constraint violation to a 409 conflict.
 *
 * Used wherever a database constraint is the last line of defence against a
 * race (two couriers collecting the same COD, two accountants settling the
 * same shipment). The user gets a meaningful conflict instead of a 500.
 */
export function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}

export function errorPayload(error: unknown) {
  if (error instanceof ApiError) {
    return { error: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) };
  }
  return { error: "INTERNAL_ERROR", message: "Unexpected server error" };
}
