/**
 * Calls to the Prelegal API.
 *
 * The app is served by the same FastAPI process that exposes /api, so requests
 * are same-origin by default. `NEXT_PUBLIC_API_BASE` exists for `next dev`,
 * which serves the frontend on its own port and needs an absolute base.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

/** A signed-in user, as `/api/auth/*` returns one. */
export interface User {
  id: number;
  email: string;
  created_at: string;
}

/** Raised when the API answers with a non-2xx status. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new ApiError(response.status, await errorMessage(response));
  }
  return response.json() as Promise<T>;
}

/** Pulls FastAPI's `detail` out of an error body, falling back to the status. */
async function errorMessage(response: Response): Promise<string> {
  const detail: unknown = await response
    .json()
    .then((body) => (body as { detail?: unknown }).detail)
    .catch(() => undefined);

  return typeof detail === "string" ? detail : `Request failed (${response.status}).`;
}

export interface Credentials {
  email: string;
  password: string;
}

/** Registers a new user. Rejects with a 409 ApiError if the email is taken. */
export function signUp(credentials: Credentials): Promise<User> {
  return post<User>("/auth/signup", credentials);
}

/** Signs in. V1 accepts any credentials and registers unknown emails. */
export function signIn(credentials: Credentials): Promise<User> {
  return post<User>("/auth/login", credentials);
}
