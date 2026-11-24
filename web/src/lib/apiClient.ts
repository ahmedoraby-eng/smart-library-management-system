import type { Problem } from "@slm/contracts";

/** Typed fetch for /api. Same origin + HttpOnly cookie: the SPA never handles tokens. */
export class ApiError extends Error {
  constructor(readonly problem: Problem) {
    super(problem.detail ?? problem.title);
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init.method ?? "GET",
    credentials: "same-origin",
    headers: init.body !== undefined ? { "content-type": "application/json" } : {},
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(data ?? { type: "about:blank", title: res.statusText, status: res.status, code: "INTERNAL" });
  }
  return data as T;
}

/** Turns a validated search object into a query string (drops empty values). */
export function toQuery(params: Record<string, unknown>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}
