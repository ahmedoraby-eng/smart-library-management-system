import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, toQuery } from "./apiClient";

const problem = { type: "about:blank", title: "Nope", status: 409, code: "CONFLICT" } as const;

function stubFetch(res: Response) {
  const fn = vi.fn(async (..._args: unknown[]) => res);
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("api() request shape", () => {
  it("sends a GET with the session cookie and no body or content-type", async () => {
    const fn = stubFetch(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await expect(api("/me")).resolves.toEqual({ ok: true });
    expect(fn).toHaveBeenCalledWith("/api/me", { method: "GET", credentials: "same-origin", headers: {}, body: undefined });
  });

  it("sends a JSON body with the given method and a content-type header", async () => {
    const fn = stubFetch(new Response(JSON.stringify({ id: 1 }), { status: 201 }));
    await api("/books", { method: "POST", body: { title: "Dune" } });
    expect(fn).toHaveBeenCalledWith("/api/books", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Dune" }),
    });
  });

  it("still sends a falsy-but-defined body (an empty object) as JSON", async () => {
    const fn = stubFetch(new Response("{}", { status: 200 }));
    await api("/admin/discovery/reindex", { method: "POST", body: {} });
    expect(fn.mock.calls[0]![1]).toMatchObject({ body: "{}", headers: { "content-type": "application/json" } });
  });

  it("returns undefined for 204 without reading a body", async () => {
    stubFetch(new Response(null, { status: 204 }));
    await expect(api<void>("/auth/logout", { method: "POST" })).resolves.toBeUndefined();
  });
});

describe("api() failures become ApiError", () => {
  it("uses the server's problem document and exposes status and code", async () => {
    stubFetch(new Response(JSON.stringify({ ...problem, detail: "Copy is already on loan" }), { status: 409 }));
    const err = await api("/loans").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    const e = err as ApiError;
    expect(e.status).toBe(409);
    expect(e.code).toBe("CONFLICT");
    expect(e.message).toBe("Copy is already on loan");
    expect(e.retryAfter).toBeUndefined();
  });

  it("falls back to the title when the problem has no detail", async () => {
    stubFetch(new Response(JSON.stringify(problem), { status: 409 }));
    await expect(api("/loans")).rejects.toThrow("Nope");
  });

  it("builds an INTERNAL problem from the status text when the body is not JSON", async () => {
    stubFetch(new Response("<html>bad gateway</html>", { status: 502, statusText: "Bad Gateway" }));
    const e = (await api("/x").catch((err: unknown) => err)) as ApiError;
    expect(e).toBeInstanceOf(ApiError);
    expect(e.status).toBe(502);
    expect(e.code).toBe("INTERNAL");
    expect(e.message).toBe("Bad Gateway");
  });

  it("reads Retry-After on a 429 as seconds", async () => {
    stubFetch(new Response(JSON.stringify({ ...problem, status: 429, code: "RATE_LIMITED" }), { status: 429, headers: { "retry-after": "42" } }));
    const e = (await api("/auth/demo-login", { method: "POST", body: {} }).catch((err: unknown) => err)) as ApiError;
    expect(e.retryAfter).toBe(42);
  });

  it.each(["0", "-5", "soon"])("ignores an unusable Retry-After of %s", async (value) => {
    stubFetch(new Response(JSON.stringify({ ...problem, status: 429, code: "RATE_LIMITED" }), { status: 429, headers: { "retry-after": value } }));
    const e = (await api("/x").catch((err: unknown) => err)) as ApiError;
    expect(e.retryAfter).toBeUndefined();
  });

  it("lets a network failure through unchanged (not an ApiError)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const err = await api("/me").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TypeError);
    expect(err).not.toBeInstanceOf(ApiError);
  });
});

describe("toQuery", () => {
  it("drops undefined, null and empty values and keeps zero and false", () => {
    expect(toQuery({ q: "clean code", page: 2, a: undefined, b: null, c: "", zero: 0, flag: false })).toBe("?q=clean+code&page=2&zero=0&flag=false");
  });
  it("returns an empty string when nothing is left", () => {
    expect(toQuery({})).toBe("");
    expect(toQuery({ q: "", page: undefined })).toBe("");
  });
});
