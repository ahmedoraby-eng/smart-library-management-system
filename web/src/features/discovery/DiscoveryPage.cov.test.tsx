// @vitest-environment jsdom
import { ROLE_PERMISSIONS, type DiscoveryResponse } from "@slm/contracts";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../test/render";
import { DiscoveryPage } from "./DiscoveryPage";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const book = { id: "b1", title: "Fundamentals of Software Architecture", author: "Some Author", category: "Software architecture", publicationYear: 2020, coverImageUrl: null, availableCopies: 2, totalCopies: 3, nextDueAt: null };
const answer = (reason: string): DiscoveryResponse => ({ mode: "AI", note: null, items: [{ book, reason, matchedTerms: [] }] });

type Reply = DiscoveryResponse | { status: number; retryAfter?: number };
function stubApi(reply: Reply) {
  const fn = vi.fn(async (url: string) => {
    if (url === "/api/me") return json({ id: "u1", email: "x@y.test", fullName: "Test", role: "LIBRARIAN", permissions: ROLE_PERMISSIONS.LIBRARIAN, isDemo: false });
    if (url === "/api/ai/quota") return json({ left: 50, limit: 50 });
    if (url === "/api/ai/book-discovery") {
      if ("status" in reply) {
        return json({ type: "about:blank", title: "x", status: reply.status, code: "RATE_LIMITED" }, reply.status, reply.retryAfter ? { "retry-after": String(reply.retryAfter) } : {});
      }
      return json(reply);
    }
    return json({}, 404);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}
const search = async () => {
  await userEvent.type(await screen.findByTestId("discovery-query"), "software architecture");
  await userEvent.click(screen.getByTestId("discovery-submit"));
};
afterEach(() => vi.unstubAllGlobals());

describe("discovery: rate-limit cool-down", () => {
  it("counts down and enables the button again when the wait is over", async () => {
    stubApi({ status: 429, retryAfter: 1 });
    await renderWithProviders(<DiscoveryPage />);
    await search();
    expect(await screen.findByTestId("discovery-submit")).toHaveTextContent("Try again in 1s");
    expect(screen.getByTestId("discovery-submit")).toBeDisabled();
    await waitFor(() => expect(screen.getByTestId("discovery-submit")).toBeEnabled(), { timeout: 2500 });
    expect(screen.getByTestId("discovery-submit")).not.toHaveTextContent("Try again in");
  });

  it("waits 10 s when the server sends no Retry-After, and a click during the wait sends nothing", async () => {
    const fn = stubApi({ status: 429 });
    await renderWithProviders(<DiscoveryPage />);
    await search();
    expect(await screen.findByTestId("discovery-submit")).toHaveTextContent("Try again in 10s");
    await userEvent.type(screen.getByTestId("discovery-query"), "{Enter}");
    expect(fn.mock.calls.filter((c) => c[0] === "/api/ai/book-discovery")).toHaveLength(1);
  });
});

describe("discovery: long reasons", () => {
  const long = "A very thorough explanation of why this title fits. ".repeat(6).trim();

  it("a long reason is clamped with a More toggle that expands and collapses it", async () => {
    stubApi(answer(long));
    await renderWithProviders(<DiscoveryPage />);
    await search();
    const toggle = await screen.findByRole("button", { name: "more" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText(long)).toHaveClass("line-clamp-3");
    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: "less" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(long)).not.toHaveClass("line-clamp-3");
    await userEvent.click(screen.getByRole("button", { name: "less" }));
    expect(screen.getByRole("button", { name: "more" })).toBeInTheDocument();
    expect(screen.getByText(long)).toHaveClass("line-clamp-3");
  });

  it("a short reason has no toggle", async () => {
    stubApi(answer("Short and sweet."));
    await renderWithProviders(<DiscoveryPage />);
    await search();
    expect(await screen.findByText("Short and sweet.")).not.toHaveClass("line-clamp-3");
    expect(screen.queryByRole("button", { name: "more" })).not.toBeInTheDocument();
  });
});
