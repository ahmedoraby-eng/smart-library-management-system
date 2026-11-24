// @vitest-environment jsdom
import { ROLE_PERMISSIONS, type DiscoveryResponse, type Role } from "@slm/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../test/render";
import { DiscoveryPage } from "./DiscoveryPage";

const book = (id: string, title: string, available: number, total = 3) => ({
  id, title, author: "Some Author", category: "Software architecture", publicationYear: 2020, coverImageUrl: null,
  availableCopies: available, totalCopies: total, nextDueAt: available === 0 ? "2026-11-28T10:00:00.000Z" : null,
});
const ai: DiscoveryResponse = {
  mode: "AI", note: null,
  items: [
    { book: book("b1", "Fundamentals of Software Architecture", 2), reason: "Written for developers stepping into architecture.", matchedTerms: ["architecture"] },
    { book: book("b2", "System Design Interview", 0, 2), reason: "Step-by-step walkthroughs of real systems.", matchedTerms: [] },
  ],
};
const fallback: DiscoveryResponse = {
  mode: "FALLBACK", note: "AI ranking is unavailable right now. Showing keyword matches from the catalog instead. Every result is a real catalog record.",
  items: [{ book: book("b1", "Fundamentals of Software Architecture", 2), reason: "Matches: software, architecture", matchedTerms: ["software", "architecture"] }],
};

type Reply = DiscoveryResponse | { status: number; retryAfter?: number };
function stubApi(role: Role, reply: Reply) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
    if (url === "/api/me") return json({ id: "u1", email: "x@y.test", fullName: "Test", role, permissions: ROLE_PERMISSIONS[role], isDemo: false });
    if (url === "/api/ai/book-discovery") {
      if ("status" in reply) return json({ type: "about:blank", title: "x", status: reply.status, code: reply.status === 429 ? "RATE_LIMITED" : "INTERNAL" }, reply.status, reply.retryAfter ? { "retry-after": String(reply.retryAfter) } : {});
      return json(reply);
    }
    void init;
    return json({}, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const sent = (f: ReturnType<typeof stubApi>) => f.mock.calls.filter((c) => c[0] === "/api/ai/book-discovery").map((c) => JSON.parse(String(c[1]?.body)));
afterEach(() => vi.unstubAllGlobals());

describe("SLM-9 discovery page (ux.md §5)", () => {
  it("validates 3–500 characters, counts them, and shows nothing until a valid query is sent", async () => {
    const f = stubApi("LIBRARIAN", ai);
    await renderWithProviders(<DiscoveryPage />);
    const box = await screen.findByTestId("discovery-query");
    await userEvent.click(screen.getByTestId("discovery-submit"));
    expect(await screen.findByText("Describe what the member needs.")).toBeInTheDocument();
    await userEvent.type(box, "ab");
    await userEvent.click(screen.getByTestId("discovery-submit"));
    expect(screen.getByText(/at least 3 characters/)).toBeInTheDocument();
    expect(screen.getByTestId("char-count")).toHaveTextContent("2 / 500");
    expect(sent(f)).toHaveLength(0);
  });

  it("AI result: badge «AI-ranked», availability from the catalog record, reason, live-availability caption, Borrow only when copies are free", async () => {
    const f = stubApi("LIBRARIAN", ai);
    await renderWithProviders(<DiscoveryPage />);
    await userEvent.type(await screen.findByTestId("discovery-query"), "software architecture for programmers");
    await userEvent.click(screen.getByTestId("available-only"));
    await userEvent.click(screen.getByTestId("discovery-submit"));
    expect(await screen.findByTestId("results-title")).toHaveTextContent("2 books from your catalog");
    expect(sent(f)[0]).toEqual({ query: "software architecture for programmers", availableOnly: true });
    expect(screen.getByTestId("mode-badge")).toHaveTextContent("AI-ranked");
    expect(screen.getByText(/Availability is live from the catalog, not from the AI/)).toBeInTheDocument();
    const [first, second] = screen.getAllByTestId("discovery-item");
    expect(within(first!).getByTestId("availability-badge")).toHaveAttribute("data-level", "available");
    expect(within(first!).getByText("Why this book")).toBeInTheDocument();
    expect(within(first!).getByTestId("borrow-from-result")).toHaveAttribute("href", expect.stringContaining("/circulation/borrow?book=b1"));
    expect(within(second!).getByTestId("availability-badge")).toHaveAttribute("data-level", "unavailable");
    expect(within(second!).getByTestId("next-due")).toBeInTheDocument();
    expect(within(second!).queryByTestId("borrow-from-result")).not.toBeInTheDocument();
    expect(screen.queryByTestId("discovery-fallback-notice")).not.toBeInTheDocument();
  });

  it("Supervisor gets no Borrow buttons", async () => {
    stubApi("SUPERVISOR", ai);
    await renderWithProviders(<DiscoveryPage />);
    await userEvent.type(await screen.findByTestId("discovery-query"), "software architecture");
    await userEvent.click(screen.getByTestId("discovery-submit"));
    await screen.findAllByTestId("discovery-item");
    expect(screen.queryByTestId("borrow-from-result")).not.toBeInTheDocument();
  });

  it("fallback result: warning notice, neutral «Keyword match» badge, template reason", async () => {
    stubApi("LIBRARIAN", fallback);
    await renderWithProviders(<DiscoveryPage />);
    await userEvent.type(await screen.findByTestId("discovery-query"), "software architecture");
    await userEvent.click(screen.getByTestId("discovery-submit"));
    expect(await screen.findByTestId("discovery-fallback-notice")).toHaveTextContent("AI ranking is unavailable right now");
    expect(screen.getByTestId("mode-badge")).toHaveTextContent("Keyword match");
    expect(screen.getByTestId("reason")).toHaveTextContent("Matches: software, architecture");
  });

  it("no match: «No matching books in the catalog» and nothing suggested", async () => {
    stubApi("LIBRARIAN", { mode: "AI", items: [], note: "No matching books in the catalog." });
    await renderWithProviders(<DiscoveryPage />);
    await userEvent.type(await screen.findByTestId("discovery-query"), "zzzz qqqq");
    await userEvent.click(screen.getByTestId("discovery-submit"));
    expect(await screen.findByTestId("discovery-empty")).toHaveTextContent("No matching books in the catalog");
    expect(screen.queryAllByTestId("discovery-item")).toHaveLength(0);
  });

  it("server error: danger notice with Try again that sends the request again", async () => {
    const f = stubApi("LIBRARIAN", { status: 500 });
    await renderWithProviders(<DiscoveryPage />);
    await userEvent.type(await screen.findByTestId("discovery-query"), "software architecture");
    await userEvent.click(screen.getByTestId("discovery-submit"));
    expect(await screen.findByTestId("discovery-error")).toHaveTextContent("Couldn't search the catalog");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(sent(f)).toHaveLength(2));
  });

  it("429: friendly message and the button is disabled for the Retry-After time", async () => {
    stubApi("LIBRARIAN", { status: 429, retryAfter: 7 });
    await renderWithProviders(<DiscoveryPage />);
    await userEvent.type(await screen.findByTestId("discovery-query"), "software architecture");
    await userEvent.click(screen.getByTestId("discovery-submit"));
    expect(await screen.findByTestId("discovery-rate-limited")).toHaveTextContent("Too many searches in a minute");
    const btn = screen.getByTestId("discovery-submit");
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent("Try again in 7s");
  });

  it("example chips fill the box; Enter submits, Shift+Enter adds a line", async () => {
    const f = stubApi("LIBRARIAN", ai);
    await renderWithProviders(<DiscoveryPage />);
    const box = await screen.findByTestId("discovery-query");
    await userEvent.click(screen.getAllByTestId("example-chip")[1]!);
    expect(box).toHaveValue("A light classic novel");
    await userEvent.type(box, "{Shift>}{Enter}{/Shift}");
    expect(box).toHaveValue("A light classic novel\n");
    expect(sent(f)).toHaveLength(0);
    await userEvent.type(box, "{Enter}");
    await screen.findAllByTestId("discovery-item");
    expect(sent(f)[0]).toEqual({ query: "A light classic novel" });
  });
});
