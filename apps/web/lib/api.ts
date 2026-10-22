const configured = (process.env.NEXT_PUBLIC_API_URL ?? "").trim();

export const API_BASE_URL = configured || (process.env.NODE_ENV === "development" ? "http://localhost:3001" : "");

export const API_IS_CONFIGURED = API_BASE_URL.length > 0;

export class ApiClientError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly details?: unknown) {
    super(message);
    this.name = "ApiClientError";
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string | null;
  signal?: AbortSignal;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!API_BASE_URL) {
    throw new ApiClientError(
      0,
      "API_NOT_CONFIGURED",
      "Le backend EXO EXPRESS n'est pas encore configuré pour cette version du tableau de bord."
    );
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
    cache: "no-store"
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload = text ? safeParse(text) : null;

  if (!response.ok) {
    const error = (payload ?? {}) as { error?: string; message?: string; details?: unknown };
    throw new ApiClientError(
      response.status,
      error.error ?? "REQUEST_FAILED",
      error.message ?? `Request failed with status ${response.status}`,
      error.details
    );
  }
  return payload as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export interface Session {
  token: string;
  expiresAt: string;
  user: { id: string; email: string; fullName: string; role: string };
}

export const TOKEN_STORAGE_KEY = "exo.session";

export function readStoredSession(): Session | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(TOKEN_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    return null;
  }
}

export function storeSession(session: Session) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}
