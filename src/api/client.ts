import type { ApiErrorBody } from "./types";

/** Mirrors the spec §7 error envelope. `code` is stable and safe to branch on. */
export class ApiError extends Error {
  readonly code: string;
  readonly details: unknown;
  readonly status: number;

  constructor(code: string, message: string, details: unknown, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

const baseUrl: string = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

/**
 * Thrown when the response is not the documented envelope at all (offline, proxy down,
 * HTML error page). Distinct from ApiError so views can say "cannot reach the API".
 */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super("Cannot reach the API");
    this.name = "NetworkError";
    this.cause = cause;
  }
}

async function parseErrorBody(
  response: Response,
): Promise<ApiErrorBody["error"]> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    if (body && typeof body.error?.code === "string") return body.error;
  } catch {
    // fall through to the generic shape
  }
  return {
    code: "internal_error",
    message: `Unexpected response (${response.status})`,
    details: null,
  };
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      headers: { accept: "application/json", ...init?.headers },
      ...init,
    });
  } catch (cause: unknown) {
    throw new NetworkError(cause);
  }

  if (!response.ok) {
    const error = await parseErrorBody(response);
    throw new ApiError(
      error.code,
      error.message,
      error.details,
      response.status,
    );
  }
  return (await response.json()) as T;
}

/** Adds the admin key as `X-API-Key`. The key never touches a URL. */
export function withApiKey(key: string, init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: {
      ...init.headers,
      "content-type": "application/json",
      "X-API-Key": key,
    },
  };
}
