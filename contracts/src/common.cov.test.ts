import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ErrorCode, IsoDateTime, ProblemSchema, Uuid, pageOf, pageQuery } from "./common";

describe("common contracts", () => {
  it("ProblemSchema accepts the minimal RFC 9457 shape and the optional extras, and rejects a non-integer status", () => {
    const minimal = { type: "about:blank", title: "Not found", status: 404, code: "NOT_FOUND" };
    expect(ProblemSchema.parse(minimal)).toEqual(minimal);
    const full = { ...minimal, detail: "d", requestId: "r", errors: [{ field: "title", message: "Enter a title." }], context: { bookId: "b", n: 1 } };
    expect(ProblemSchema.parse(full)).toEqual(full);
    expect(ProblemSchema.safeParse({ ...minimal, status: 404.5 }).success).toBe(false);
    expect(ProblemSchema.safeParse({ ...minimal, errors: [{ field: "x" }] }).success).toBe(false);
    expect(ProblemSchema.safeParse({ title: "x" }).success).toBe(false);
  });

  it("ErrorCode maps every key to the same string (the wire value equals the name)", () => {
    for (const [k, v] of Object.entries(ErrorCode)) expect(v).toBe(k);
    expect(Object.keys(ErrorCode)).toContain("RATE_LIMITED");
    expect(Object.keys(ErrorCode)).toContain("LAST_ADMIN");
  });

  it("pageQuery coerces strings, defaults to page 1 / size 20, and bounds size to 1–100", () => {
    const q = z.object(pageQuery);
    expect(q.parse({})).toEqual({ page: 1, size: 20 });
    expect(q.parse({ page: "3", size: "100" })).toEqual({ page: 3, size: 100 });
    for (const bad of [{ page: "0" }, { page: "-1" }, { page: "1.5" }, { size: "0" }, { size: "101" }, { page: "abc" }]) {
      expect(q.safeParse(bad).success).toBe(false);
    }
  });

  it("pageOf wraps an item schema with paging fields", () => {
    const schema = pageOf(z.object({ id: z.string() }));
    const ok = { items: [{ id: "a" }], page: 1, size: 20, total: 1 };
    expect(schema.parse(ok)).toEqual(ok);
    expect(schema.safeParse({ ...ok, items: [{ id: 1 }] }).success).toBe(false);
    expect(schema.safeParse({ ...ok, total: 1.5 }).success).toBe(false);
    expect(schema.safeParse({ items: [], page: 1, size: 20 }).success).toBe(false);
  });

  it("Uuid accepts a v4 uuid only; IsoDateTime is a plain string", () => {
    expect(Uuid.safeParse("9b2f1c4e-8a3d-4f5e-9c1a-2b3c4d5e6f70").success).toBe(true);
    expect(Uuid.safeParse("not-a-uuid").success).toBe(false);
    expect(IsoDateTime.parse("2026-11-25T09:00:00.000Z")).toBe("2026-11-25T09:00:00.000Z");
    expect(IsoDateTime.safeParse(5).success).toBe(false);
  });
});
