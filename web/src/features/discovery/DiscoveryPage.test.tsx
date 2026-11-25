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
    { book: book("b2", "System Design Interview", 0, 2), reason: "Step-by-step walkthroughs of real systems.", matchedTerms: [], foundBy: "semantic" },
  ],
};
const fallback: DiscoveryResponse = {
  mode: "FALLBACK", note: "AI ranking is unavailable right now. Showing keyword matches from the catalog instead. Every result is a real catalog record.",
  items: [{ book: book("b1", "Fundamentals of Software Architecture", 2), reason: "Matches: software, architecture", matchedTerms: ["software", "architecture"] }],
};

const MEMBER_ID = "3f2b8f0e-4c1a-4a52-9d55-1f0c6f5a9b11";
type Reply = DiscoveryResponse | { status: number; retryAfter?: number };
function stubApi(role: Role, reply: Reply, quota: { left: number; limit: number } = { left: 50, limit: 50 }) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
    if (url === "/api/me") return json({ id: "u1", email: "x@y.test", fullName: "Test", role, permissions: ROLE_PERMISSIONS[role], isDemo: false });
    if (url === "/api/ai/quota") return json(quota);
    if (url === "/api/ai/book-discovery") {
      if ("status" in reply) return json({ type: "about:blank", title: "x", status: reply.status, code: reply.status === 429 ? "RATE_LIMITED" : "INTERNAL" }, reply.status, reply.retryAfter ? { "retry-after": String(reply.retryAfter) } : {});
      return json(reply);
    }
    if (url.startsWith("/api/members")) {
      return json({ items: [{ id: MEMBER_ID, memberNumber: "M-000001", fullName: "Sara Haddad", email: "sara@example.org", phone: null, status: "ACTIVE", registeredAt: "2026-01-01T00:00:00.000Z", activeLoans: 0, overdueLoans: 0, version: 0 }], page: 1, size: 8, total: 1 });
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
    // SLM-16: only the book found by vector search alone carries the note.
    expect(within(first!).queryByTestId("found-by-meaning")).toBeNull();
    expect(screen.getAllByTestId("discovery-item")[1]).toHaveTextContent("Found by meaning");
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

  it("«For member»: sends memberId, both ids ride on [Borrow], and Clear removes the member again", async () => {
    const f = stubApi("LIBRARIAN", ai);
    await renderWithProviders(<DiscoveryPage />);
    await userEvent.type(await screen.findByTestId("discovery-query"), "software architecture");
    await userEvent.type(await screen.findByRole("combobox"), "sara");
    await userEvent.click(await screen.findByRole("option", { name: /Sara Haddad/ }));
    expect(await screen.findByTestId("discovery-member")).toHaveTextContent("Sara Haddad");
    await userEvent.click(screen.getByTestId("discovery-submit"));
    await screen.findAllByTestId("discovery-item");
    expect(sent(f)[0]).toEqual({ query: "software architecture", memberId: MEMBER_ID });
    const href = screen.getByTestId("borrow-from-result").getAttribute("href")!;
    expect(href).toContain("/circulation/borrow?");
    expect(href).toContain("book=b1");
    expect(href).toContain(`member=${MEMBER_ID}`);
    await userEvent.click(screen.getByTestId("clear-member"));
    expect(screen.queryByTestId("discovery-member")).not.toBeInTheDocument();
    expect(screen.getByTestId("borrow-from-result").getAttribute("href")).not.toContain("member=");
    await userEvent.click(screen.getByTestId("discovery-submit"));
    await waitFor(() => expect(sent(f)).toHaveLength(2));
    expect(sent(f)[1]).toEqual({ query: "software architecture" });
  });

  describe("SLM-16 cost tiers in the UI", () => {
    const ask = async (text = "clean code for a junior") => {
      await userEvent.type(await screen.findByTestId("discovery-query"), text);
      await userEvent.click(screen.getByTestId("discovery-submit"));
    };

    it("searches only on submit: typing a valid request sends nothing", async () => {
      const f = stubApi("LIBRARIAN", ai);
      await renderWithProviders(<DiscoveryPage />);
      await userEvent.type(await screen.findByTestId("discovery-query"), "clean code for a junior developer");
      expect(sent(f)).toHaveLength(0);
    });

    it("shows the AI-assisted searches left today, and updates it from each answer", async () => {
      stubApi("LIBRARIAN", { ...ai, tier: 1, aiSearches: { left: 41, limit: 50 } }, { left: 42, limit: 50 });
      await renderWithProviders(<DiscoveryPage />);
      expect(await screen.findByTestId("ai-searches-left")).toHaveTextContent("42 of 50 AI-assisted searches left today");
      await ask();
      await screen.findByTestId("results-title");
      expect(screen.getByTestId("ai-searches-left")).toHaveTextContent("41 of 50 AI-assisted searches left today");
      expect(screen.queryByTestId("ai-quota-note")).toBeNull();
    });

    it("tier 2: none left → a red note under the search box, results still shown, no extra warning", async () => {
      const tier2: DiscoveryResponse = { ...fallback, tier: 2, retrieval: "hybrid", fallbackReason: "QUOTA_EXCEEDED", note: "You've used today's 50 AI-assisted searches.", aiSearches: { left: 0, limit: 50 } };
      stubApi("LIBRARIAN", tier2, { left: 0, limit: 50 });
      await renderWithProviders(<DiscoveryPage />);
      expect(await screen.findByTestId("ai-quota-note")).toHaveTextContent("Results are still matched by meaning, without AI ranking or reasons.");
      await ask();
      expect(await screen.findAllByTestId("discovery-item")).toHaveLength(1);
      expect(screen.queryByTestId("discovery-fallback-notice")).toBeNull();
    });

    it("quota used up with keyword-only results: the server's keyword note is shown too", async () => {
      const kw: DiscoveryResponse = { ...fallback, tier: 3, retrieval: "lexical", fallbackReason: "QUOTA_EXCEEDED", note: "You've used today's 50 AI-assisted searches, and search by meaning is unavailable right now, so results are matched by keywords only.", aiSearches: { left: 0, limit: 50 } };
      stubApi("LIBRARIAN", kw, { left: 0, limit: 50 });
      await renderWithProviders(<DiscoveryPage />);
      await ask();
      expect(await screen.findByTestId("discovery-fallback-notice")).toHaveTextContent("matched by keywords only");
      expect(screen.getByTestId("ai-quota-note")).toHaveTextContent("matched by keywords only right now");
      expect(screen.getByTestId("ai-quota-note")).not.toHaveTextContent("by meaning");
    });

    it("tier 3: the library budget is used up → a calm (info) note with the results", async () => {
      const tier3: DiscoveryResponse = { ...fallback, tier: 3, retrieval: "lexical", fallbackReason: "BUDGET_EXHAUSTED", note: "Today's AI budget for the library is used up, so results are matched by keywords only.", aiSearches: { left: 12, limit: 50 } };
      stubApi("LIBRARIAN", tier3, { left: 12, limit: 50 });
      await renderWithProviders(<DiscoveryPage />);
      await ask();
      const notice = await screen.findByTestId("discovery-fallback-notice");
      expect(notice).toHaveTextContent("matched by keywords only");
      expect(notice.className).toMatch(/info/);
    });
  });
});
