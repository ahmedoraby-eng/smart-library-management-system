// @vitest-environment jsdom
import type { BookDto, BookInput } from "@slm/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/apiClient";
import { booksKey, lookupIsbn, useBook, useBooks, useCategories, useDeleteBook, useSaveBook } from "./api";

afterEach(() => vi.unstubAllGlobals());

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const stub = (body: unknown = {}, status = 200) => {
  const f = vi.fn(async (_url: string, _init?: RequestInit) => json(body, status));
  vi.stubGlobal("fetch", f);
  return f;
};
function hookWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}
const input: BookInput = {
  title: "Dune",
  author: "Frank Herbert",
  isbn: null,
  category: "Fiction",
  publisher: "",
  publicationYear: 1965,
  coverImageUrl: null,
  description: "",
  totalCopies: 2,
};
const saved = { id: "b1", title: "Dune", version: 1 } as BookDto;

describe("books api hooks", () => {
  it("useBooks sends the query (empty values dropped) and returns the page", async () => {
    const f = stub({ items: [], page: 2, size: 20, total: 0 });
    const { wrapper } = hookWrapper();
    const { result } = renderHook(() => useBooks({ q: "dune", page: 2, size: 20, category: undefined }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(f).toHaveBeenCalledWith("/api/books?q=dune&page=2&size=20", expect.objectContaining({ method: "GET" }));
  });

  it("useCategories unwraps the items", async () => {
    stub({ items: ["Fiction", "Software"] });
    const { wrapper } = hookWrapper();
    const { result } = renderHook(() => useCategories(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(["Fiction", "Software"]));
  });

  it("useBook url-encodes the id and surfaces a 404 as an ApiError", async () => {
    const f = stub({ type: "about:blank", title: "nf", status: 404, code: "NOT_FOUND" }, 404);
    const { wrapper } = hookWrapper();
    const { result } = renderHook(() => useBook("a/b c"), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(f.mock.calls[0]![0]).toBe("/api/books/a%2Fb%20c");
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect((result.current.error as ApiError).status).toBe(404);
  });
});

describe("useSaveBook", () => {
  it("without an id it POSTs the input to /books", async () => {
    const f = stub(saved, 201);
    const { wrapper } = hookWrapper();
    const { result } = renderHook(() => useSaveBook(), { wrapper });
    await result.current.mutateAsync(input);
    expect(f).toHaveBeenCalledWith(
      "/api/books",
      expect.objectContaining({ method: "POST", body: JSON.stringify(input) }),
    );
  });

  it("with an id it PUTs the input plus the version the form was loaded with", async () => {
    const f = stub(saved);
    const { wrapper } = hookWrapper();
    const { result } = renderHook(() => useSaveBook("b 1", 7), { wrapper });
    await result.current.mutateAsync(input);
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("/api/books/b%201");
    expect(init).toMatchObject({ method: "PUT" });
    expect(JSON.parse(String(init!.body))).toEqual({ ...input, version: 7 });
  });

  it("invalidates every books query on success, and not on failure", async () => {
    const { queryClient, wrapper } = hookWrapper();
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    stub(saved);
    const ok = renderHook(() => useSaveBook(), { wrapper });
    await ok.result.current.mutateAsync(input);
    expect(spy).toHaveBeenCalledWith({ queryKey: booksKey });

    spy.mockClear();
    stub({ type: "about:blank", title: "x", status: 409, code: "STALE_VERSION" }, 409);
    const bad = renderHook(() => useSaveBook("b1", 1), { wrapper });
    await expect(bad.result.current.mutateAsync(input)).rejects.toBeInstanceOf(ApiError);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("useDeleteBook and lookupIsbn", () => {
  it("DELETEs the encoded id, returns the result and invalidates books", async () => {
    const f = stub({ result: "archived" });
    const { queryClient, wrapper } = hookWrapper();
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useDeleteBook(), { wrapper });
    await expect(result.current.mutateAsync("b/1")).resolves.toEqual({ result: "archived" });
    expect(f).toHaveBeenCalledWith("/api/books/b%2F1", expect.objectContaining({ method: "DELETE" }));
    expect(spy).toHaveBeenCalledWith({ queryKey: booksKey });
  });

  it("a failed delete rejects and invalidates nothing", async () => {
    stub({ type: "about:blank", title: "x", status: 409, code: "BOOK_HAS_ACTIVE_LOANS" }, 409);
    const { queryClient, wrapper } = hookWrapper();
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useDeleteBook(), { wrapper });
    await expect(result.current.mutateAsync("b1")).rejects.toMatchObject({ code: "BOOK_HAS_ACTIVE_LOANS" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("lookupIsbn asks the lookup endpoint with the ISBN", async () => {
    const f = stub({ found: false });
    await expect(lookupIsbn("9780132350884")).resolves.toEqual({ found: false });
    expect(f.mock.calls[0]![0]).toBe("/api/books/isbn-lookup?isbn=9780132350884");
  });
});
