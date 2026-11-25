// @vitest-environment jsdom
import { ROLE_PERMISSIONS } from "@slm/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authProvidersKey, useAuthProviders } from "./providers";
import { meQueryKey, safeNext, useCan, useMe } from "./session";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const me = {
  id: "u1",
  email: "l@x.test",
  fullName: "Lia Librarian",
  role: "LIBRARIAN",
  permissions: ROLE_PERMISSIONS.LIBRARIAN,
  isDemo: false,
};

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, Wrapper };
}

afterEach(() => vi.unstubAllGlobals());

describe("useMe / useCan", () => {
  it("loads /api/me and caches it under the me key", async () => {
    const fetchMock = vi.fn(async (_url: string) => json(me));
    vi.stubGlobal("fetch", fetchMock);
    const { client, Wrapper } = wrapper();
    const { result } = renderHook(() => useMe(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data?.email).toBe("l@x.test"));
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/me");
    expect(client.getQueryData(meQueryKey)).toMatchObject({ id: "u1" });
  });

  it("does not retry a failed /me: one request, then the error is exposed", async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      json({ type: "about:blank", title: "x", status: 401, code: "UNAUTHENTICATED" }, 401),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useMe(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("useCan says yes only for permissions of the signed-in role", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(me)),
    );
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useCan(), { wrapper: Wrapper });
    // Before the session loads nothing is allowed.
    expect(result.current("BOOK_READ")).toBe(false);
    await waitFor(() => expect(result.current("BOOK_READ")).toBe(true));
    expect(result.current("LOAN_PROCESS")).toBe(true);
    expect(result.current("STAFF_MANAGE")).toBe(false);
  });

  it("useCan stays false when /me fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ type: "about:blank", title: "x", status: 500, code: "INTERNAL" }, 500)),
    );
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => ({ can: useCan(), me: useMe() }), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.me.isError).toBe(true));
    expect(result.current.can("BOOK_READ")).toBe(false);
  });
});

describe("safeNext edge cases", () => {
  it("rejects a path the URL parser would resolve to another origin", () => {
    expect(safeNext("/\t/evil.example")).toBeUndefined();
  });
  it("fails closed if the URL parser throws", () => {
    class BrokenURL {
      constructor() {
        throw new TypeError("Invalid URL");
      }
    }
    vi.stubGlobal("URL", BrokenURL);
    expect(safeNext("/books")).toBeUndefined();
  });
  it("rejects sign-in itself in every form, but not paths that merely start with the word", () => {
    for (const bad of ["/signin", "/signin?x=1", "/signin#top", "/signin/extra"]) expect(safeNext(bad)).toBeUndefined();
    expect(safeNext("/signing-off")).toBe("/signing-off");
  });
});

describe("useAuthProviders", () => {
  it("reads the public providers endpoint", async () => {
    const fetchMock = vi.fn(async (_url: string) => json({ google: true, demo: false }));
    vi.stubGlobal("fetch", fetchMock);
    const { client, Wrapper } = wrapper();
    const { result } = renderHook(() => useAuthProviders(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toEqual({ google: true, demo: false }));
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/auth/providers");
    expect(client.getQueryData(authProvidersKey)).toEqual({ google: true, demo: false });
  });

  it("reports an error without retrying when the endpoint is down", async () => {
    const fetchMock = vi.fn(async () => json({ type: "about:blank", title: "x", status: 500, code: "INTERNAL" }, 500));
    vi.stubGlobal("fetch", fetchMock);
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useAuthProviders(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
