import type { z } from "zod";
import { ValidationError } from "./errors";

/** Parse with a zod schema; failures become 400 VALIDATION_FAILED with field errors. */
export function parseOr400<S extends z.ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  throw new ValidationError(
    r.error.issues.map((i) => ({ field: i.path.join(".") || "(body)", message: i.message })),
  );
}

export interface SortKey<K extends string> { key: K; desc: boolean }

/** "title,-createdAt" → [{title asc}, {createdAt desc}]; only whitelisted keys (else 400). */
export function parseSort<K extends string>(raw: string | undefined, allowed: readonly K[], fallback: SortKey<K>[]): SortKey<K>[] {
  if (!raw) return fallback;
  const keys = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const out: SortKey<K>[] = [];
  for (const k of keys) {
    const desc = k.startsWith("-");
    const key = (desc ? k.slice(1) : k) as K;
    if (!allowed.includes(key)) {
      throw new ValidationError([{ field: "sort", message: `unknown sort key '${key}'; allowed: ${allowed.join(", ")}` }]);
    }
    out.push({ key, desc });
  }
  return out.length ? out : fallback;
}

export function newRequestId(): string {
  return crypto.randomUUID();
}
