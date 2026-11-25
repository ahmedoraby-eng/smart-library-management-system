// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../test/render";
import { BookForm } from "./BookForm";

afterEach(() => vi.unstubAllGlobals());

const found = {
  found: true,
  book: {
    title: "Clean Code",
    author: "Robert C. Martin",
    publisher: "Prentice Hall",
    publicationYear: 2008,
    description: null,
    coverImageUrl: null,
  },
};
const stubFetch = (body: unknown, status = 200) => {
  const f = vi.fn(
    async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  );
  vi.stubGlobal("fetch", f);
  return f;
};
async function setup() {
  const user = userEvent.setup();
  await renderWithProviders(<BookForm categories={[]} onSubmit={vi.fn()} onCancel={vi.fn()} />);
  await screen.findByTestId("book-form");
  return user;
}
const field = (n: string) => screen.getByTestId(`field-${n}`) as HTMLInputElement;

describe("BookForm ISBN look up (SLM-13)", () => {
  it("is disabled until the ISBN is valid", async () => {
    const user = await setup();
    expect(screen.getByTestId("isbn-lookup")).toBeDisabled();
    await user.type(field("isbn"), "9780306406158"); // bad checksum
    expect(screen.getByTestId("isbn-lookup")).toBeDisabled();
    await user.clear(field("isbn"));
    await user.type(field("isbn"), "978-0-13-235088-4");
    expect(screen.getByTestId("isbn-lookup")).toBeEnabled();
  });

  it("fills only empty fields and never overwrites typed text", async () => {
    const f = stubFetch(found);
    const user = await setup();
    await user.type(field("title"), "My own title");
    await user.type(field("isbn"), "978-0-13-235088-4");
    await user.click(screen.getByTestId("isbn-lookup"));
    expect(await screen.findByText("Filled from Open Library — check before saving.")).toBeInTheDocument();
    expect(field("title").value).toBe("My own title");
    expect(field("author").value).toBe("Robert C. Martin");
    expect(field("publisher").value).toBe("Prentice Hall");
    expect(field("publicationYear").value).toBe("2008");
    expect(f).toHaveBeenCalledWith("/api/books/isbn-lookup?isbn=9780132350884", expect.anything());
  });

  it.each([
    ["not found", { found: false, reason: "not_found" }, 200],
    ["timeout", { found: false, reason: "timeout" }, 200],
    ["server error", { type: "about:blank", title: "x", status: 500, code: "INTERNAL" }, 500],
  ])("shows the hand-fill hint on %s and the form stays usable", async (_n, body, status) => {
    stubFetch(body, status);
    const user = await setup();
    await user.type(field("isbn"), "9780132350884");
    await user.click(screen.getByTestId("isbn-lookup"));
    expect(await screen.findByTestId("isbn-lookup-hint")).toHaveTextContent(
      "No details found for this ISBN. Fill the fields in by hand.",
    );
    await user.type(field("title"), "Typed");
    expect(field("title").value).toBe("Typed");
    expect(screen.getByTestId("save-book")).toBeEnabled();
  });

  it("shows the hint on a network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("offline");
      }),
    );
    const user = await setup();
    await user.type(field("isbn"), "9780132350884");
    await user.click(screen.getByTestId("isbn-lookup"));
    await waitFor(() => expect(screen.getByTestId("isbn-lookup-hint")).toBeInTheDocument());
  });
});
