import { MutationObserver, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./apiClient";
import { queryClient, setApiErrorHandler } from "./queryClient";

const apiError = (status: number, code: string) => new ApiError({ type: "about:blank", title: "t", status, code } as never);

afterEach(() => {
  setApiErrorHandler(undefined);
  queryClient.clear();
});

async function failQuery(key: string, error: unknown) {
  const observer = new QueryObserver(queryClient, { queryKey: [key], queryFn: () => Promise.reject(error), retry: false });
  const unsubscribe = observer.subscribe(() => undefined);
  await vi.waitFor(() => expect(observer.getCurrentResult().isError).toBe(true));
  unsubscribe();
}

describe("shared error handler", () => {
  it("passes an ApiError from a failing query to the registered handler", async () => {
    const handler = vi.fn();
    setApiErrorHandler(handler);
    const err = apiError(401, "UNAUTHENTICATED");
    await failQuery("q-401", err);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(err);
  });

  it("passes an ApiError from a failing mutation to the handler too", async () => {
    const handler = vi.fn();
    setApiErrorHandler(handler);
    const err = apiError(403, "FORBIDDEN");
    const m = new MutationObserver(queryClient, { mutationFn: () => Promise.reject(err) });
    await expect(m.mutate()).rejects.toBe(err);
    expect(handler).toHaveBeenCalledWith(err);
  });

  it("ignores errors that are not ApiError (network failures, bugs)", async () => {
    const handler = vi.fn();
    setApiErrorHandler(handler);
    await failQuery("q-plain", new TypeError("Failed to fetch"));
    expect(handler).not.toHaveBeenCalled();
  });

  it("does nothing when no handler is registered, and after it is removed", async () => {
    setApiErrorHandler(undefined);
    await expect(failQuery("q-none", apiError(500, "INTERNAL"))).resolves.toBeUndefined();
  });
});

describe("default query options", () => {
  const retry = queryClient.getDefaultOptions().queries!.retry as (count: number, err: unknown) => boolean;

  it("keeps a 15 s stale time", () => {
    expect(queryClient.getDefaultOptions().queries!.staleTime).toBe(15_000);
  });
  it("never retries a client error (4xx)", () => {
    expect(retry(0, apiError(404, "NOT_FOUND"))).toBe(false);
    expect(retry(0, apiError(401, "UNAUTHENTICATED"))).toBe(false);
  });
  it("retries a server error or a network failure twice at most", () => {
    expect(retry(0, apiError(500, "INTERNAL"))).toBe(true);
    expect(retry(1, apiError(503, "UNAVAILABLE"))).toBe(true);
    expect(retry(2, apiError(500, "INTERNAL"))).toBe(false);
    expect(retry(0, new TypeError("Failed to fetch"))).toBe(true);
  });
});
